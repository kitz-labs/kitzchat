import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAudienceFromRequest, getAudienceOrigin } from '@/lib/app-audience';

const SESSION_COOKIE = 'kitzchat-session';

function collectAllowedOrigins(request: NextRequest): string[] {
  const audience = getAudienceFromRequest(request);
  const origins = new Set<string>();
  const requestOrigin = request.nextUrl.origin.replace(/\/$/, '');
  origins.add(requestOrigin);

  const configuredBase = process.env.PUBLIC_BASE_URL?.trim();
  if (configuredBase) {
    try {
      const configuredOrigin = new URL(configuredBase).origin.replace(/\/$/, '');
      origins.add(configuredOrigin);
      origins.add(getAudienceOrigin(configuredOrigin, audience));
    } catch {
      // ignore invalid PUBLIC_BASE_URL values and rely on request origin
    }
  }

  for (const origin of Array.from(origins)) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1';
        origins.add(url.origin.replace(/\/$/, ''));
      } else if (url.hostname === '127.0.0.1') {
        url.hostname = 'localhost';
        origins.add(url.origin.replace(/\/$/, ''));
      }
    } catch {
      // ignore invalid origin variants
    }
  }

  return Array.from(origins);
}

function isHostAllowedByLock(hostName: string): boolean {
  const mode = (process.env.KITZCHAT_HOST_LOCK || 'local').trim().toLowerCase();
  if (mode === 'off' || mode === 'disabled' || mode === 'false' || mode === '0') {
    return true;
  }

  if (mode === 'local') {
    const isLocalhost = hostName === 'localhost' || hostName === '127.0.0.1';
    const isTailscale = hostName.startsWith('100.') || hostName.endsWith('.ts.net');
    return isLocalhost || isTailscale;
  }

  // allowlist mode (comma-separated hostnames)
  const allowed = mode
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(hostName.toLowerCase());
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostName = host.split(':')[0];
  if (!isHostAllowedByLock(hostName)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { pathname } = request.nextUrl;

  // Public assets (PWA/brand/public images) must be accessible without session.
  if (pathname === '/manifest.webmanifest' || pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    return NextResponse.next();
  }
  if (/\.(png|jpg|jpeg|webp|svg|ico|webmanifest)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Third-party webhook providers must be able to call webhook routes without a user session.
  if (pathname === '/api/billing/webhook' || pathname === '/api/stripe/webhook' || pathname === '/api/openai/webhook') {
    return NextResponse.next();
  }

  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/auth/github/callback' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/email-assets' ||
    pathname.startsWith('/email-assets/') ||
    pathname === '/brand/logo.png' ||
    pathname === '/brand/favicon.png' ||
    pathname === '/brand/icon.png' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const apiKey = request.headers.get('x-api-key');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && sessionToken && !(apiKey && apiKey === process.env.API_KEY)) {
    const allowedOrigins = collectAllowedOrigins(request);
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const originOk = origin ? allowedOrigins.includes(origin.replace(/\/$/, '')) : true;
    const refererOk = referer ? allowedOrigins.some((allowedOrigin) => referer.startsWith(allowedOrigin)) : true;
    // Some clients (notably certain Safari setups) may omit both Origin and Referer on same-origin requests.
    // We already use `SameSite: strict` session cookies, so a cross-site request won't carry the session cookie
    // and will be blocked by the session gate below. Therefore we only block when headers are present but invalid.
    if (!originOk || !refererOk) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  if (pathname.startsWith('/api/')) {
    if (sessionToken || (apiKey && apiKey === process.env.API_KEY)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (sessionToken) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
