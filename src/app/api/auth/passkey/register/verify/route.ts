import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { requireUser } from '@/lib/auth';
import { consumePasskeyChallenge, insertPasskey } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

const COOKIE = 'kitzchat-passkey-reg';

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const token = readCookie(request, COOKIE);
    if (!token) return NextResponse.json({ error: 'Challenge missing' }, { status: 400 });

    const challenge = consumePasskeyChallenge(token, 'registration');
    if (!challenge || challenge.user_id !== user.id) {
      return NextResponse.json({ error: 'Challenge invalid or expired' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      response?: unknown;
      name?: string | null;
    };

    const verification = await verifyRegistrationResponse({
      response: body.response as any,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Passkey verification failed' }, { status: 400 });
    }

    const info = verification.registrationInfo as any;
    const credentialId = typeof info.credentialID === 'string'
      ? info.credentialID
      : isoBase64URL.fromBuffer(info.credentialID);
    const publicKeyB64 = typeof info.credentialPublicKey === 'string'
      ? info.credentialPublicKey
      : isoBase64URL.fromBuffer(info.credentialPublicKey);
    const transportsJson = Array.isArray((body.response as any)?.response?.transports)
      ? JSON.stringify((body.response as any).response.transports)
      : null;

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 64) : null;
    insertPasskey({
      userId: user.id,
      name,
      credentialId,
      publicKeyB64,
      counter: info.counter ?? 0,
      transportsJson,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE, '', { maxAge: 0, path: '/', secure: shouldUseSecureCookies(request) });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Passkey verification failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message.includes('UNIQUE') || message.toLowerCase().includes('already')) {
      return NextResponse.json({ error: 'Dieser Passkey ist bereits registriert.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Passkey verification failed' }, { status: 500 });
  }
}
