import { readSettings } from '@/lib/settings';

const DEFAULT_PROD_BASE = 'https://dashboard.aikitz.at';
const DEFAULT_DEV_BASE = 'http://127.0.0.1:3000';

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isLoopbackHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase().trim();
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.localhost');
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getSettingsBaseUrl(): string | null {
  try {
    const settings = readSettings();
    return normalizeOrigin(settings.public_base_url);
  } catch {
    return null;
  }
}

function getEnvBaseUrl(): string | null {
  return normalizeOrigin(
    process.env.PUBLIC_BASE_URL?.trim()
    || process.env.APP_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || process.env.NEXT_PUBLIC_BASE_URL?.trim(),
  );
}

export function getCanonicalBaseUrl(): string {
  const candidate = getSettingsBaseUrl() || getEnvBaseUrl();
  if (candidate && (!isLoopbackOrigin(candidate) || !isProduction())) return candidate;
  if (isProduction()) return DEFAULT_PROD_BASE;
  return candidate || DEFAULT_DEV_BASE;
}

export function getOriginFromRequest(request: Request): string {
  const xfProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const xfHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  let origin: string | null = null;
  if (xfProto && xfHost) {
    origin = `${xfProto}://${xfHost}`;
  } else {
    const host = request.headers.get('host')?.split(',')[0]?.trim();
    if (host) {
      const proto = xfProto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
      origin = `${proto}://${host}`;
    } else {
      try {
        origin = new URL(request.url).origin;
      } catch {
        origin = null;
      }
    }
  }

  if (origin && isLoopbackOrigin(origin) && isProduction()) {
    return getCanonicalBaseUrl();
  }

  return origin ? origin.replace(/\/$/, '') : getCanonicalBaseUrl();
}

export function getAuthLinkBaseUrl(request?: Request): string {
  const canonical = getCanonicalBaseUrl();
  if (isProduction()) return canonical;
  if (!request) return canonical;
  if (isLoopbackOrigin(canonical)) {
    return getOriginFromRequest(request);
  }
  return canonical;
}
