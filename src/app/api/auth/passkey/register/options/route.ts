import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { requireUser } from '@/lib/auth';
import { getUserById } from '@/lib/auth';
import { createPasskeyChallenge, ensurePasskeyTables, mintChallengeToken } from '@/lib/passkeys';
import { getDb } from '@/lib/db';
import { getCanonicalBaseUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';

const COOKIE = 'kitzchat-passkey-reg';

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === 'true' || forced === '1' || forced === 'yes') return true;
  if (forced === 'false' || forced === '0' || forced === 'no') return false;
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

function getOriginAndRpId(request: Request): { origin: string; rpId: string } {
  const xfProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const xfHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (xfProto && xfHost) {
    const host = xfHost.split(':')[0];
    return { origin: `${xfProto}://${xfHost}`, rpId: host };
  }

  const envBase = getCanonicalBaseUrl();
  if (envBase) {
    try {
      const url = new URL(envBase);
      return { origin: url.origin, rpId: url.hostname };
    } catch {
      // ignore
    }
  }

  const url = new URL(request.url);
  return { origin: url.origin, rpId: url.hostname };
}

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const full = getUserById(user.id);
    if (!full) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { origin, rpId } = getOriginAndRpId(request);

    // Pull existing credential IDs directly for exclude list
    ensurePasskeyTables();
    const db = getDb();
    const rows = db
      .prepare('SELECT credential_id FROM passkeys WHERE user_id = ?')
      .all(user.id) as Array<{ credential_id: string }>;
    const excludeCredentials = rows
      .map((r) => r.credential_id)
      .filter(Boolean)
      .map((id) => ({ id }));

    const options = await generateRegistrationOptions({
      rpName: 'KitzChat',
      rpID: rpId,
      userID: isoUint8Array.fromUTF8String(String(user.id)),
      userName: full.email || full.username,
      userDisplayName: full.username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials,
      timeout: 60_000,
    });

    const token = mintChallengeToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    createPasskeyChallenge({
      token,
      userId: user.id,
      kind: 'registration',
      challenge: options.challenge,
      rpId,
      origin,
      expiresAt,
    });

    const response = NextResponse.json({ options });
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookies(request),
      maxAge: 10 * 60,
      path: '/',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Passkey options failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Passkey options failed' }, { status: 500 });
  }
}
