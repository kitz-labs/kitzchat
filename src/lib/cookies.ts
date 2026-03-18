export function resolveCookieDomain(request: Request): string | undefined {
  const rawHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.split(',')[0]?.trim() ||
    '';

  const hostname = rawHost.split(':')[0].trim().toLowerCase();
  if (!hostname) return undefined;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.localhost')) {
    return undefined;
  }

  if (hostname === 'aikitz.at' || hostname.endsWith('.aikitz.at')) {
    return 'aikitz.at';
  }

  return undefined;
}

