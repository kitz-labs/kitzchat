import { NextResponse } from 'next/server';
import { createCustomerUserWithEmail, createUser, deleteUser, listUsers, requireAdmin, resetUserPassword, updateUserRole } from '@/lib/auth';
import { getAllowUserDeletion } from '@/lib/settings';
import { getDb } from '@/lib/db';
import { ensureStripeCustomerForUser } from '@/modules/stripe/stripe.service';
import { sendTelegramAlert } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

type Role = 'admin' | 'editor' | 'viewer';

function normalizeRole(value: unknown): Role | null {
  if (value === 'operator') return 'editor';
  if (value === 'admin' || value === 'editor' || value === 'viewer') return value;
  return null;
}

function ensureAnotherAdminExists(excludingUserId: number) {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ?")
    .get(excludingUserId) as { c: number };
  if ((row?.c ?? 0) <= 0) {
    throw new Error('Cannot remove the last admin');
  }
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ users: listUsers() });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as { username?: string; password?: string; role?: string; accountType?: 'staff' | 'customer'; email?: string | null };
    if (!body.username || !body.password) {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 });
    }

    if (body.accountType === 'customer') {
      const user = createCustomerUserWithEmail(body.username, body.password, {
        acceptedTerms: false,
        email: typeof body.email === 'string' ? body.email : null,
      });
      const stripeCustomerId = await ensureStripeCustomerForUser({
        userId: user.id,
        username: user.username,
        email: user.email ?? null,
        stripeCustomerId: user.stripe_customer_id ?? null,
      });

      const telegramMessage = [
        'Neuer Kunde angelegt (Admin) ✅',
        '',
        `Kunde: @${user.username}`,
        user.email ? `E-Mail: ${user.email}` : null,
        '',
        `Dashboard: /customers/${user.id}`,
      ].filter(Boolean).join('\n');
      sendTelegramAlert(telegramMessage).catch(() => {});

      return NextResponse.json({ user: { ...user, stripe_customer_id: stripeCustomerId ?? user.stripe_customer_id ?? null } });
    }

    const role: Role = normalizeRole(body.role) ?? 'editor';
    const user = createUser(body.username, body.password, role);
    return NextResponse.json({ user });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('UNIQUE')) return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    if (msg.includes('Username') || msg.includes('Password') || msg.includes('Invalid role')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = requireAdmin(request);
    const body = (await request.json()) as { id?: number; role?: string; password?: string };
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (body.role) {
      const normalizedRole = normalizeRole(body.role);
      if (!normalizedRole) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      if (admin.id === body.id && normalizedRole !== 'admin') {
        ensureAnotherAdminExists(admin.id);
      }
      updateUserRole(body.id, normalizedRole);
    }

    if (body.password) {
      resetUserPassword(body.id, body.password);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('Cannot remove the last admin')) return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.includes('Password') || msg.includes('Invalid role')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = requireAdmin(request);
    const body = (await request.json()) as { id?: number };
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    // respect runtime setting to prevent accidental deletions
    const superAdmins = new Set(['ceo', 'widauer']);
    const superAdminEmails = new Set(['ceo@aikitz.at']);
    const username = (admin.username || '').trim().toLowerCase();
    const email = (admin.email || '').trim().toLowerCase();
    const isSuperAdmin = admin.account_type === 'staff' && (superAdmins.has(username) || (email && superAdminEmails.has(email)));
    if (!getAllowUserDeletion() && !isSuperAdmin) return NextResponse.json({ error: 'User deletion is disabled in settings' }, { status: 403 });
    if (admin.id === body.id) {
      ensureAnotherAdminExists(admin.id);
    }
    const db = getDb();
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(body.id) as { role?: string } | undefined;
    if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (row.role === 'admin') {
      ensureAnotherAdminExists(body.id);
    }
    deleteUser(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('Cannot remove the last admin')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
