import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createPasskeyChallenge, mintChallengeToken } from '@/lib/passkeys';
import { getCanonicalBaseUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';

const COOKIE = 'kitzchat-passkey-auth';

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
    const { origin, rpId } = getOriginAndRpId(request);
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      timeout: 60_000,
      userVerification: 'preferred',
    });

    const token = mintChallengeToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    createPasskeyChallenge({
      token,
      userId: null,
      kind: 'authentication',
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
    return NextResponse.json({ error: 'Passkey options failed' }, { status: 500 });
  }
}
