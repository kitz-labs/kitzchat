import { randomBytes } from 'node:crypto';

export type OAuthProviderId = 'google-workspace' | 'github' | 'microsoft-graph' | 'slack' | 'hubspot' | 'xero';

export type OAuthProviderConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

export type OAuthExchangeResult = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
  tokenType?: string;
  raw?: unknown;
};

export type OAuthIdentity = {
  accountIdentifier: string;
  displayLabel?: string;
  raw?: unknown;
};

export type OAuthStatePayload = {
  nonce: string;
  userId: number;
  providerId: string;
  profileId: string;
  returnTo: string;
  scopes: string[];
  createdAt: string;
};

export function newNonce(): string {
  return randomBytes(24).toString('hex');
}

export function normalizeReturnTo(input: string | null | undefined): string {
  const fallback = '/settings';
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return fallback;
  return trimmed.startsWith('/') ? trimmed : fallback;
}

export function getOAuthCallbackUrl(request: Request): string {
  const configured = process.env.CUSTOMER_INTEGRATION_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  const base = new URL(request.url);
  base.pathname = '/api/customer/integrations/oauth/callback';
  base.search = '';
  return base.toString();
}

export function shouldUseSecureCookies(request: Request): boolean {
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

