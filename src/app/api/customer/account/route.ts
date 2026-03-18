import { NextResponse } from 'next/server';
import { creditsToCents } from '@/config/env';
import { resolveCookieDomain } from '@/lib/cookies';
import { changeUserPassword, deleteUser, getUserById, listUsers, requireUser, setUserWalletBalanceCents, updateUserEmail } from '@/lib/auth';
import { ensureBillingUser, transferWalletCredits } from '@/modules/wallet/wallet.service';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'kitzchat-session';

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true" || forced === "1" || forced === "yes") return true;
  if (forced === "false" || forced === "0" || forced === "no") return false;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function pickAdminRecipient(excludeUserId: number) {
  const users = listUsers().filter((user) => !user.deleted_at && user.id !== excludeUserId);
  const preferredNames = ['ceo', 'widauer'];
  for (const name of preferredNames) {
    const match = users.find((user) => user.username?.toLowerCase() === name);
    if (match) return match;
  }
  return (
    users.find((user) => user.role === 'admin') ??
    users.find((user) => user.account_type === 'staff') ??
    null
  );
}

export async function PATCH(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      email?: string | null;
      currentPassword?: string;
      newPassword?: string;
    };

    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      updateUserEmail(user.id, body.email ?? null);
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: 'Aktuelles Passwort erforderlich' }, { status: 400 });
      }
      changeUserPassword(user.id, body.currentPassword, body.newPassword);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update account';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message.includes('Passwort') || message.includes('E-Mail-Adresse') || message.includes('Aktuelles Passwort')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Diese E-Mail-Adresse ist bereits vergeben' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const fullUser = getUserById(user.id);
    if (!fullUser) {
      return NextResponse.json({ error: 'Account nicht gefunden' }, { status: 404 });
    }

    const admin = pickAdminRecipient(fullUser.id);
    if (!admin) {
      return NextResponse.json({ error: 'Kein Admin-Konto fuer Guthaben-Transfer gefunden' }, { status: 500 });
    }

    await ensureBillingUser({
      userId: fullUser.id,
      email: fullUser.email ?? null,
      name: fullUser.username,
      stripeCustomerId: fullUser.stripe_customer_id ?? null,
      chatEnabled: false,
    });
    await ensureBillingUser({
      userId: admin.id,
      email: admin.email ?? null,
      name: admin.username,
      stripeCustomerId: admin.stripe_customer_id ?? null,
      chatEnabled: true,
    });

    const transfer = await transferWalletCredits({
      fromUserId: fullUser.id,
      toUserId: admin.id,
      referenceId: String(fullUser.id),
      note: `Kundenkonto geloescht: ${fullUser.username}`,
    });

    if (transfer.toBalanceAfter != null) {
      setUserWalletBalanceCents(admin.id, creditsToCents(transfer.toBalanceAfter));
    }

    deleteUser(fullUser.id);

    const response = NextResponse.json({
      ok: true,
      transferred_credits: transfer.transferredCredits,
      admin_id: admin.id,
    });
    const secure = shouldUseSecureCookies(request);
    const domain = resolveCookieDomain(request);
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
      ...(domain ? { domain } : {}),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete account';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'wallet_not_found') return NextResponse.json({ error: 'Wallet nicht gefunden' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
