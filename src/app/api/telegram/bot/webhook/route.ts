import { NextResponse } from 'next/server';
import { readSettings } from '@/lib/settings';
import { getDb } from '@/lib/db';
import { getUserByEmail, getUserById, listUsers } from '@/lib/auth';
import { hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';
import { fetchOpenAiCreditBalance } from '@/config/openai';
import { fetchOpenAiCompletionsUsage, fetchOpenAiCosts, getOpenAiAdminConfig } from '@/lib/openai-admin';

export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
};

function getTelegramBotConfig(): { enabled: boolean; token: string; adminChatId: string } | null {
  const settings = readSettings();
  const enabled = settings.telegram?.enabled ?? true;
  const token = (settings.telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const adminChatId = (settings.telegram?.chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!enabled) return null;
  if (!token || !adminChatId) return null;
  return { enabled, token, adminChatId };
}

async function telegramSendMessage(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function telegramSendDocument(token: string, chatId: string, filename: string, content: string): Promise<void> {
  try {
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('document', new Blob([content], { type: 'text/csv' }), filename);
    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
  } catch {
    // ignore
  }
}

function parseRangeToken(raw?: string | null): { label: string; startSec: number; endSec: number } {
  const now = new Date();
  const endSec = Math.floor(now.getTime() / 1000);
  const token = (raw || '').trim().toLowerCase();

  if (!token || token === '7d') {
    return { label: '7d', startSec: endSec - 7 * 24 * 60 * 60, endSec };
  }
  if (token === '30d') {
    return { label: '30d', startSec: endSec - 30 * 24 * 60 * 60, endSec };
  }
  if (token === 'today') {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return { label: 'today', startSec: Math.floor(start / 1000), endSec };
  }
  const m = token.match(/^(\d{1,3})d$/);
  if (m) {
    const days = Math.max(1, Math.min(365, Number(m[1])));
    return { label: `${days}d`, startSec: endSec - days * 24 * 60 * 60, endSec };
  }

  return { label: '7d', startSec: endSec - 7 * 24 * 60 * 60, endSec };
}

function formatEuroCents(value: number): string {
  const cents = Math.max(0, Math.round(Number(value || 0)));
  return `€${(cents / 100).toFixed(2)}`;
}

function normalizeCommand(raw: string): string {
  const cmd = raw.trim().split('@')[0];
  return cmd.startsWith('/') ? cmd.slice(1).toLowerCase() : cmd.toLowerCase();
}

async function handleCommand(command: string, args: string[]): Promise<{ text?: string; csv?: { filename: string; content: string } }> {
  if (command === 'help' || command === 'start') {
    return {
      text: [
        `KitzChat Admin Bot`,
        ``,
        `Basics:`,
        `/status`,
        `/whoami`,
        ``,
        `Kunden & Wallet:`,
        `/customers [limit]`,
        `/customer <id|email|username>`,
        `/wallet today`,
        `/wallet summary [range]   (z.B. 7d, 30d)`,
        ``,
        `Stripe:`,
        `/payments [range]`,
        `/payment <stripe_session_id>`,
        `/stripe recent [n]`,
        `/stripe sync <customer>`,
        ``,
        `OpenAI:`,
        `/openai credits`,
        `/openai usage [range]`,
        `/openai compare [range]`,
        ``,
        `Monitoring:`,
        `/alerts [range]`,
        ``,
        `Exports:`,
        `/export payments [range]`,
        `/export customers`,
      ].join('\n'),
    };
  }

  if (command === 'whoami') {
    return { text: `OK (Admin Chat)` };
  }

  if (command === 'status') {
    const billingOk = await (async () => {
      if (!hasPostgresConfig()) return false;
      try {
        await queryPg('SELECT 1');
        return true;
      } catch {
        return false;
      }
    })();
    const openaiAdminCfg = getOpenAiAdminConfig();
    const openaiCredit = await fetchOpenAiCreditBalance().catch(() => null);
    const creditLine = openaiCredit?.creditsRemainingUsd != null
      ? `$${openaiCredit.creditsRemainingUsd.toFixed(2)}`
      : openaiCredit?.configured
        ? 'unbekannt'
        : 'nicht konfiguriert';

    return {
      text: [
        `Status`,
        ``,
        `Zeit: ${new Date().toISOString()}`,
        `Billing DB: ${billingOk ? 'OK' : 'FAIL'}`,
        `Stripe: ${(process.env.STRIPE_SECRET_KEY || '').trim() ? 'konfiguriert' : 'nicht konfiguriert'}`,
        `OpenAI Admin: ${openaiAdminCfg.configured ? 'OK' : 'nicht konfiguriert'}`,
        `OpenAI Credit Balance: ${creditLine}`,
      ].join('\n'),
    };
  }

  if (command === 'customers') {
    const limit = Math.max(1, Math.min(50, Math.round(Number(args[0] || '10'))));
    const customers = listUsers().filter((u) => u.account_type === 'customer' && !u.deleted_at).slice(0, limit);
    if (customers.length === 0) return { text: 'Keine Kunden gefunden.' };
    const lines = customers.map((u) => {
      const name = (u.first_name || u.last_name) ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '';
      const wallet = formatEuroCents(u.wallet_balance_cents ?? 0);
      return `#${u.id} @${u.username} ${name ? `(${name})` : ''} · ${wallet} · ${u.stripe_customer_id ? 'Stripe✅' : 'Stripe—'}`;
    });
    return { text: [`Kunden (limit ${limit})`, ...lines].join('\n') };
  }

  if (command === 'customer') {
    const q = (args[0] || '').trim();
    if (!q) return { text: 'Usage: /customer <id|email|username>' };
    const byId = /^\d+$/.test(q) ? getUserById(Number(q)) : null;
    const byEmail = q.includes('@') ? getUserByEmail(q) : null;
    const byUsername = !byId && !byEmail
      ? (listUsers().find((u) => u.username === q.toLowerCase()) ?? null)
      : null;
    const user = byId || byEmail || byUsername;
    if (!user) return { text: 'Kunde nicht gefunden.' };

    const lastPayment = await (async () => {
      if (!hasPostgresConfig()) return null;
      try {
        const res = await queryPg<{ stripe_session_id: string; gross_amount_eur: number; status: string; created_at: string }>(
          `SELECT stripe_session_id, gross_amount_eur, status, created_at
           FROM payments
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [user.id],
        );
        return res.rows[0] ?? null;
      } catch {
        return null;
      }
    })();

    const name = (user.first_name || user.last_name) ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '—';
    return {
      text: [
        `Kunde #${user.id}`,
        ``,
        `Username: @${user.username}`,
        `Name: ${name}`,
        user.company ? `Firma: ${user.company}` : null,
        user.email ? `E-Mail: ${user.email}` : null,
        `Status: ${user.payment_status || '—'}`,
        `Wallet: ${formatEuroCents(user.wallet_balance_cents ?? 0)}`,
        user.stripe_customer_id ? `Stripe Customer: ${user.stripe_customer_id}` : `Stripe Customer: —`,
        user.stripe_checkout_session_id ? `Letzte Session: ${user.stripe_checkout_session_id}` : null,
        lastPayment ? `Letzte Zahlung: €${Number(lastPayment.gross_amount_eur || 0).toFixed(2)} · ${lastPayment.status} · ${new Date(lastPayment.created_at).toLocaleString()}` : null,
      ].filter(Boolean).join('\n'),
    };
  }

  if (command === 'wallet') {
    const sub = (args[0] || '').trim().toLowerCase();
    const range = parseRangeToken(sub === 'summary' ? args[1] : sub);
    const startSec = range.startSec;

    const db = getDb();
    const totals = db.prepare(
      `SELECT
         COALESCE(SUM(total_tokens), 0) AS tokens,
         COALESCE(SUM(amount_cents), 0) AS cents
       FROM chat_usage_events
       WHERE created_at >= ?`,
    ).get(startSec) as { tokens: number; cents: number };

    const walletTotal = db.prepare(
      `SELECT COALESCE(SUM(wallet_balance_cents), 0) AS cents
       FROM users
       WHERE account_type = 'customer' AND (deleted_at IS NULL OR deleted_at = '')`,
    ).get() as { cents: number };

    const label = sub === 'today' ? 'today' : range.label;
    return {
      text: [
        `Wallet Summary (${label})`,
        ``,
        `Kunden-Guthaben gesamt: ${formatEuroCents(Number(walletTotal.cents || 0))}`,
        `Verbrauch (Usage): ${formatEuroCents(Number(totals.cents || 0))}`,
        `Tokens: ${Number(totals.tokens || 0).toLocaleString('de-DE')}`,
      ].join('\n'),
    };
  }

  if (command === 'payments') {
    const range = parseRangeToken(args[0]);
    if (!hasPostgresConfig()) return { text: 'Billing DB nicht konfiguriert.' };
    const startIso = new Date(range.startSec * 1000).toISOString();

    const byStatus = await queryPg<{ status: string; count: string | number; sum_eur: string | number }>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(gross_amount_eur), 0) AS sum_eur
       FROM payments
       WHERE created_at >= $1
       GROUP BY status
       ORDER BY COUNT(*) DESC`,
      [startIso],
    ).catch(() => ({ rows: [], rowCount: 0 }));

    const total = await queryPg<{ count: string | number; sum_eur: string | number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(gross_amount_eur), 0) AS sum_eur
       FROM payments
       WHERE created_at >= $1`,
      [startIso],
    ).catch(() => ({ rows: [], rowCount: 0 }));

    const totalCount = Number(total.rows[0]?.count ?? 0);
    const totalSum = Number(total.rows[0]?.sum_eur ?? 0);

    const lines = byStatus.rows.map((row) => `- ${row.status}: ${Number(row.count || 0)} · €${Number(row.sum_eur || 0).toFixed(2)}`);
    return {
      text: [
        `Payments (${range.label})`,
        ``,
        `Total: ${totalCount} · €${totalSum.toFixed(2)}`,
        lines.length ? `\nStatus:` : null,
        ...lines,
      ].filter(Boolean).join('\n'),
    };
  }

  if (command === 'payment') {
    const sessionId = (args[0] || '').trim();
    if (!sessionId) return { text: 'Usage: /payment <stripe_session_id>' };
    if (!hasPostgresConfig()) return { text: 'Billing DB nicht konfiguriert.' };
    const res = await queryPg<{ user_id: number; stripe_session_id: string; gross_amount_eur: number; status: string; created_at: string; stripe_customer_id: string | null }>(
      `SELECT user_id, stripe_session_id, gross_amount_eur, status, created_at, stripe_customer_id
       FROM payments
       WHERE stripe_session_id = $1
       LIMIT 1`,
      [sessionId],
    );
    const row = res.rows[0];
    if (!row) return { text: 'Payment nicht gefunden.' };
    return {
      text: [
        `Payment`,
        ``,
        `User: #${row.user_id}`,
        `Betrag: €${Number(row.gross_amount_eur || 0).toFixed(2)}`,
        `Status: ${row.status}`,
        `Zeit: ${row.created_at ? new Date(row.created_at).toLocaleString() : '—'}`,
        row.stripe_customer_id ? `Stripe Customer: ${row.stripe_customer_id}` : null,
        `Session: ${row.stripe_session_id}`,
      ].filter(Boolean).join('\n'),
    };
  }

  if (command === 'stripe') {
    const sub = (args[0] || '').trim().toLowerCase();
    if (sub === 'recent') {
      const n = Math.max(1, Math.min(20, Math.round(Number(args[1] || '5'))));
      if (!hasPostgresConfig()) return { text: 'Billing DB nicht konfiguriert.' };
      const res = await queryPg<{ user_id: number; stripe_session_id: string; gross_amount_eur: number; status: string; created_at: string }>(
        `SELECT user_id, stripe_session_id, gross_amount_eur, status, created_at
         FROM payments
         ORDER BY created_at DESC
         LIMIT $1`,
        [n],
      );
      const lines = res.rows.map((r) => `#${r.user_id} · €${Number(r.gross_amount_eur || 0).toFixed(2)} · ${r.status} · ${r.stripe_session_id}`);
      return { text: [`Stripe recent (${n})`, ...lines].join('\n') };
    }
    if (sub === 'sync') {
      const q = (args[1] || '').trim();
      if (!q) return { text: 'Usage: /stripe sync <customer>' };
      const user = /^\d+$/.test(q)
        ? getUserById(Number(q))
        : q.includes('@')
          ? getUserByEmail(q)
          : (listUsers().find((u) => u.username === q.toLowerCase()) ?? null);
      if (!user) return { text: 'Kunde nicht gefunden.' };
      const linked = Boolean(user.stripe_customer_id);
      const billingUser = await (async () => {
        if (!hasPostgresConfig()) return null;
        try {
          const res = await queryPg<{ stripe_customer_id: string | null; chat_enabled: boolean }>(
            `SELECT stripe_customer_id, chat_enabled FROM users WHERE id = $1 LIMIT 1`,
            [user.id],
          );
          return res.rows[0] ?? null;
        } catch {
          return null;
        }
      })();

      return {
        text: [
          `Stripe Sync #${user.id}`,
          ``,
          `Auth: ${linked ? 'Stripe✅' : 'Stripe—'}`,
          linked ? `Stripe Customer: ${user.stripe_customer_id}` : null,
          `Letzte Session: ${user.stripe_checkout_session_id || '—'}`,
          billingUser ? `Billing DB user: ${billingUser.stripe_customer_id ? 'OK' : '—'} · chat_enabled=${billingUser.chat_enabled ? 'true' : 'false'}` : 'Billing DB user: —',
        ].filter(Boolean).join('\n'),
      };
    }
    return { text: 'Usage: /stripe recent [n] | /stripe sync <customer>' };
  }

  if (command === 'openai') {
    const sub = (args[0] || '').trim().toLowerCase();
    if (sub === 'credits') {
      const balance = await fetchOpenAiCreditBalance();
      if (!balance.configured) return { text: 'OpenAI nicht konfiguriert (kein Key).' };
      const remain = balance.creditsRemainingUsd != null ? `$${balance.creditsRemainingUsd.toFixed(2)}` : 'unbekannt';
      const used = balance.creditsUsedUsd != null ? `$${balance.creditsUsedUsd.toFixed(2)}` : '—';
      const granted = balance.creditsGrantedUsd != null ? `$${balance.creditsGrantedUsd.toFixed(2)}` : '—';
      return {
        text: [
          `OpenAI Credit Balance`,
          ``,
          `Remaining: ${remain}`,
          `Used: ${used}`,
          `Granted: ${granted}`,
          balance.note ? `Note: ${balance.note}` : null,
        ].filter(Boolean).join('\n'),
      };
    }

    if (sub === 'usage' || sub === 'compare') {
      const range = parseRangeToken(args[1] || args[0]);
      const cfg = getOpenAiAdminConfig();
      if (!cfg.configured || !cfg.projectId) return { text: 'OpenAI Admin nicht konfiguriert (OPENAI_ADMIN_KEY/OPENAI_PROJECT).' };
      const [costs, usage] = await Promise.all([
        fetchOpenAiCosts({ startTimeSec: range.startSec, endTimeSec: range.endSec, projectId: cfg.projectId }).catch(() => []),
        fetchOpenAiCompletionsUsage({ startTimeSec: range.startSec, endTimeSec: range.endSec, projectId: cfg.projectId }).catch(() => []),
      ]);

      const totalUsd = costs.reduce((sum, bucket) => sum + bucket.results.reduce((s, r) => s + Number(r.amount?.value || 0), 0), 0);
      const totalEur = totalUsd * cfg.usdToEur;
      const totals = usage.reduce(
        (acc, bucket) => {
          for (const r of bucket.results) {
            acc.requests += Number(r.num_requests || 0);
            acc.input += Number(r.input_tokens || 0);
            acc.output += Number(r.output_tokens || 0);
            acc.total += Number(r.total_tokens || 0);
            const model = r.model || 'unknown';
            acc.byModel.set(model, (acc.byModel.get(model) || 0) + Number(r.total_tokens || 0));
          }
          return acc;
        },
        { requests: 0, input: 0, output: 0, total: 0, byModel: new Map<string, number>() },
      );
      const topModels = Array.from(totals.byModel.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([model, tokens]) => `- ${model}: ${tokens.toLocaleString('de-DE')} tokens`);

      if (sub === 'usage') {
        return {
          text: [
            `OpenAI Usage (${range.label})`,
            ``,
            `Costs: $${totalUsd.toFixed(2)} (≈ €${totalEur.toFixed(2)} @ ${cfg.usdToEur.toFixed(4)})`,
            `Requests: ${totals.requests.toLocaleString('de-DE')}`,
            `Tokens total: ${totals.total.toLocaleString('de-DE')}`,
            `Input: ${totals.input.toLocaleString('de-DE')} · Output: ${totals.output.toLocaleString('de-DE')}`,
            topModels.length ? `\nTop models:` : null,
            ...topModels,
          ].filter(Boolean).join('\n'),
        };
      }

      // compare
      const topupsEur = await (async () => {
        if (!hasPostgresConfig()) return null;
        const startIso = new Date(range.startSec * 1000).toISOString();
        try {
          const res = await queryPg<{ sum_eur: string | number }>(
            `SELECT COALESCE(SUM(gross_amount_eur), 0) AS sum_eur
             FROM payments
             WHERE created_at >= $1`,
            [startIso],
          );
          return Number(res.rows[0]?.sum_eur ?? 0);
        } catch {
          return null;
        }
      })();

      const diff = topupsEur != null ? topupsEur - totalEur : null;
      return {
        text: [
          `OpenAI Compare (${range.label})`,
          ``,
          `OpenAI Costs: €${totalEur.toFixed(2)}`,
          topupsEur != null ? `App Top-ups (Stripe): €${topupsEur.toFixed(2)}` : `App Top-ups (Stripe): —`,
          diff != null ? `Diff (Top-ups - OpenAI): €${diff.toFixed(2)}` : null,
        ].filter(Boolean).join('\n'),
      };
    }

    return { text: 'Usage: /openai credits | /openai usage [range] | /openai compare [range]' };
  }

  if (command === 'alerts') {
    const range = parseRangeToken(args[0]);
    const startIso = new Date(range.startSec * 1000).toISOString();
    const db = getDb();
    const rows = db.prepare(
      `SELECT type, severity, title, message, created_at
       FROM notifications
       WHERE datetime(created_at) >= datetime(?)
       ORDER BY created_at DESC
       LIMIT 15`,
    ).all(startIso) as Array<{ type: string; severity: string; title: string | null; message: string; created_at: string }>;

    if (rows.length === 0) return { text: `Keine Alerts gefunden (${range.label}).` };
    const lines = rows.map((r) => `- [${r.severity}] ${r.title ? `${r.title}: ` : ''}${String(r.message).slice(0, 120)}`);
    return { text: [`Alerts (${range.label})`, ...lines].join('\n') };
  }

  if (command === 'export') {
    const sub = (args[0] || '').trim().toLowerCase();
    if (sub === 'payments') {
      if (!hasPostgresConfig()) return { text: 'Billing DB nicht konfiguriert.' };
      const range = parseRangeToken(args[1]);
      const startIso = new Date(range.startSec * 1000).toISOString();
      const res = await queryPg<{ user_id: number; stripe_session_id: string; gross_amount_eur: number; status: string; created_at: string }>(
        `SELECT user_id, stripe_session_id, gross_amount_eur, status, created_at
         FROM payments
         WHERE created_at >= $1
         ORDER BY created_at DESC
         LIMIT 2000`,
        [startIso],
      );
      const header = 'user_id,stripe_session_id,gross_amount_eur,status,created_at';
      const lines = res.rows.map((r) => [
        r.user_id,
        `"${String(r.stripe_session_id).replace(/\"/g, '""')}"`,
        Number(r.gross_amount_eur || 0).toFixed(2),
        `"${String(r.status || '').replace(/\"/g, '""')}"`,
        `"${String(r.created_at || '').replace(/\"/g, '""')}"`,
      ].join(','));
      const csv = [header, ...lines].join('\n');
      return { csv: { filename: `payments_${range.label}.csv`, content: csv } };
    }

    if (sub === 'customers') {
      const users = listUsers().filter((u) => u.account_type === 'customer' && !u.deleted_at);
      const header = 'id,username,first_name,last_name,company,email,wallet_eur,stripe_customer_id';
      const lines = users.map((u) => [
        u.id,
        `"${String(u.username).replace(/\"/g, '""')}"`,
        `"${String(u.first_name || '').replace(/\"/g, '""')}"`,
        `"${String(u.last_name || '').replace(/\"/g, '""')}"`,
        `"${String(u.company || '').replace(/\"/g, '""')}"`,
        `"${String(u.email || '').replace(/\"/g, '""')}"`,
        ((Number(u.wallet_balance_cents || 0) / 100).toFixed(2)),
        `"${String(u.stripe_customer_id || '').replace(/\"/g, '""')}"`,
      ].join(','));
      const csv = [header, ...lines].join('\n');
      return { csv: { filename: 'customers.csv', content: csv } };
    }

    return { text: 'Usage: /export payments [range] | /export customers' };
  }

  return { text: 'Unbekannter Command. Nutze /help.' };
}

export async function POST(request: Request) {
  const cfg = getTelegramBotConfig();
  if (!cfg) {
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate | null = null;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message =
    update?.message ||
    update?.edited_message ||
    update?.channel_post ||
    update?.edited_channel_post ||
    null;

  const chatId = message?.chat?.id != null ? String(message.chat.id) : '';
  if (!chatId || chatId !== cfg.adminChatId) {
    return NextResponse.json({ ok: true });
  }

  const text = (message?.text || message?.caption || '').trim();
  if (!text.startsWith('/')) {
    return NextResponse.json({ ok: true });
  }

  const parts = text.split(/\s+/).filter(Boolean);
  const command = normalizeCommand(parts[0]);
  const args = parts.slice(1);

  const result: { text?: string; csv?: { filename: string; content: string } } =
    await handleCommand(command, args).catch((err) => ({
      text: `Fehler: ${err instanceof Error ? err.message : 'unknown'}`,
    }));

  if (result.csv) {
    await telegramSendDocument(cfg.token, chatId, result.csv.filename, result.csv.content);
    return NextResponse.json({ ok: true });
  }

  if (result.text) {
    await telegramSendMessage(cfg.token, chatId, result.text.slice(0, 3800));
  }
  return NextResponse.json({ ok: true });
}
