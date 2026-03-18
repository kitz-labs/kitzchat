export type AppAudience = 'admin' | 'customer';

export function getAudienceFromAccountType(accountType: string | null | undefined): AppAudience {
	return accountType === 'customer' ? 'customer' : 'admin';
}

function normalizeHost(host: string): { hostname: string; port: string } {
  const raw = (host || '').trim().toLowerCase();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      return { hostname: 'dashboard.aikitz.at', port: '' };
    }
    return { hostname: 'localhost', port: '' };
  }
  const [hostname, port = ''] = raw.split(':');
  return { hostname, port };
}

export function getAudienceFromHost(host: string): AppAudience {
  const { hostname } = normalizeHost(host);

  const customerLabel = (process.env.CUSTOMER_HOST_LABEL || 'customer').trim().toLowerCase();
  if (customerLabel && hostname.startsWith(`${customerLabel}.`)) {
    return 'customer';
  }

  return 'admin';
}

export function getAudienceFromRequest(request: Request): AppAudience {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  if (host) return getAudienceFromHost(host);
  try {
    return getAudienceFromHost(new URL(request.url).host);
  } catch {
    return 'admin';
  }
}

export function getAudienceOrigin(origin: string, audience: AppAudience): string {
  void audience;
  try {
    const url = new URL(origin);
    return url.toString().replace(/\/$/, '');
  } catch {
    return origin.replace(/\/$/, '');
  }
}
