import { getDb } from '@/lib/db';
import { ensureAuthTables, listUsers, seedAdmin } from '@/lib/auth';
import { getBillingDbKind, hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';
import { requireStripeClient } from '@/lib/stripe-client';

function parseArgValue(prefix: string): string | null {
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return null;
  return hit.slice(prefix.length);
}

function parseCsv(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function getStripe() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  return requireStripeClient();
}

async function listAppStripeCustomers(stripe: any): Promise<Array<{ id: string; username: string | null; userId: number | null }>> {
  const out: Array<{ id: string; username: string | null; userId: number | null }> = [];
  let startingAfter: string | undefined;
  for (let guard = 0; guard < 2000; guard += 1) {
    const page = await stripe.customers.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    const data = Array.isArray(page?.data) ? page.data : [];
    for (const c of data) {
      const md = (c?.metadata || {}) as Record<string, string>;
      const username = (md.username || md.user_name || '').trim() || null;
      const userIdRaw = (md.user_id || '').trim();
      const userId = /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;
      if (!username && userId == null) continue;
      out.push({ id: c.id, username, userId });
    }
    if (!page?.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return out;
}

async function main() {
  seedAdmin();
  ensureAuthTables();
  const confirm = process.argv.includes('--confirm');
  const stripeScan = process.argv.includes('--stripe-scan');

  const keepRaw = parseArgValue('--keep=') || process.env.PURGE_KEEP_USERNAMES || 'ceo,widauer';
  const keepUsernames = new Set(parseCsv(keepRaw));

  const users = listUsers();
  const customers = users.filter((u) => u.account_type === 'customer');
  const toDelete = customers.filter((u) => !keepUsernames.has(u.username));

  console.log(`[purge] customers total=${customers.length} delete=${toDelete.length} keep=${customers.length - toDelete.length}`);
  if (toDelete.length === 0 && !stripeScan) {
    console.log('[purge] nothing to do');
    return;
  }

  if (toDelete.length > 0) {
    console.log('[purge] will delete customer usernames:', toDelete.map((u) => u.username).join(', '));
  }
  const stripeIds = toDelete
    .map((u) => (u.stripe_customer_id || '').trim())
    .filter(Boolean);
  if (stripeIds.length) {
    console.log(`[purge] will delete stripe customers: ${stripeIds.length}`);
  } else {
    console.log('[purge] stripe customers: none linked');
  }
  if (!confirm) {
    console.log('[purge] dry-run. Re-run with --confirm to execute.');
    return;
  }

  const stripe = getStripe();
  if (stripeIds.length && !stripe) {
    console.warn('[purge] STRIPE_SECRET_KEY missing; stripe customers will NOT be deleted.');
  }

  if (stripeIds.length && stripe) {
    for (const stripeId of stripeIds) {
      try {
        await stripe.customers.del(stripeId);
        console.log(`[purge] stripe deleted customer ${stripeId}`);
      } catch (error) {
        console.warn(`[purge] stripe delete failed ${stripeId}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (stripeScan) {
    if (!stripe) {
      console.warn('[purge] --stripe-scan requested but STRIPE_SECRET_KEY missing; skipped scan.');
    } else {
      const appCustomers = await listAppStripeCustomers(stripe);
      const deletable = appCustomers.filter((c) => c.username ? !keepUsernames.has(c.username.toLowerCase()) : true);
      console.log(`[purge] stripe scan found=${appCustomers.length} deletable=${deletable.length}`);
      for (const c of deletable) {
        try {
          await stripe.customers.del(c.id);
          console.log(`[purge] stripe deleted (scan) ${c.id}${c.username ? ` @${c.username}` : ''}`);
        } catch (error) {
          console.warn(`[purge] stripe scan delete failed ${c.id}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  const db = getDb();
  const userIds = toDelete.map((u) => u.id);

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;

  const tablesWithUserCols: Array<{ table: string; col: string }> = [];
  for (const { name } of tables) {
    if (name === 'users') continue;
    const cols = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as Array<{ name: string }>;
    for (const col of cols) {
      const c = String(col.name || '');
      if (c === 'user_id' || c === 'owner_user_id') {
        tablesWithUserCols.push({ table: name, col: c });
      }
    }
  }

  db.transaction(() => {
    for (const userId of userIds) {
      for (const entry of tablesWithUserCols) {
        try {
          db.prepare(`DELETE FROM ${quoteIdent(entry.table)} WHERE ${quoteIdent(entry.col)} = ?`).run(userId);
        } catch {
          // ignore
        }
      }
      try {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      } catch {
        // ignore
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
  })();

  console.log(`[purge] sqlite deleted ${userIds.length} customers`);

  if (hasPostgresConfig()) {
    const kind = getBillingDbKind();
    try {
      if (kind === 'postgres') {
        await queryPg('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
      } else if (kind === 'mysql') {
        // mysql2 doesn't support arrays the same way; fall back to IN (...)
        const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(',');
        await queryPg(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
      }
      console.log('[purge] billing DB: deleted users (cascade)');
    } catch (error) {
      console.warn('[purge] billing DB cleanup failed:', error instanceof Error ? error.message : String(error));
    }
  } else {
    console.log('[purge] billing DB not configured; skipped');
  }
}

main().catch((err) => {
  console.error('[purge] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
