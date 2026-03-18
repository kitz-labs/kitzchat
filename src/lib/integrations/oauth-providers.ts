import type { OAuthExchangeResult, OAuthIdentity, OAuthProviderConfig, OAuthProviderId } from './oauth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_ME_URL = 'https://graph.microsoft.com/v1.0/me';

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_AUTH_TEST_URL = 'https://slack.com/api/auth.test';

const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
const HUBSPOT_TOKEN_INFO_URL = 'https://api.hubapi.com/oauth/v1/access-tokens';

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

export type OAuthProviderDefinition = {
  id: OAuthProviderId;
  buildAuthUrl: (config: OAuthProviderConfig, params: { state: string; scopes: string[] }) => URL;
  exchangeCode: (config: OAuthProviderConfig, code: string) => Promise<OAuthExchangeResult>;
  refreshToken?: (config: OAuthProviderConfig, refreshToken: string) => Promise<OAuthExchangeResult>;
  fetchIdentity: (accessToken: string) => Promise<OAuthIdentity>;
};

function requireEnv(name: string, value?: string | null): string {
  const v = (value || '').trim();
  if (!v) throw new Error(`${name} ist nicht konfiguriert`);
  return v;
}

export function getProviderConfig(oauthProvider: OAuthProviderId, callbackUrl: string): OAuthProviderConfig {
  switch (oauthProvider) {
    case 'google-workspace': {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('GOOGLE_OAUTH_CLIENT_ID', clientId),
        clientSecret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    case 'github': {
      const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID?.trim() || process.env.GITHUB_CLIENT_ID?.trim();
      const clientSecret = process.env.GITHUB_INTEGRATION_CLIENT_SECRET?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('GITHUB_CLIENT_ID', clientId),
        clientSecret: requireEnv('GITHUB_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    case 'microsoft-graph': {
      const clientId = process.env.MS_OAUTH_CLIENT_ID?.trim() || process.env.MICROSOFT_CLIENT_ID?.trim();
      const clientSecret = process.env.MS_OAUTH_CLIENT_SECRET?.trim() || process.env.MICROSOFT_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('MS_OAUTH_CLIENT_ID', clientId),
        clientSecret: requireEnv('MS_OAUTH_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    case 'slack': {
      const clientId = process.env.SLACK_OAUTH_CLIENT_ID?.trim();
      const clientSecret = process.env.SLACK_OAUTH_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('SLACK_OAUTH_CLIENT_ID', clientId),
        clientSecret: requireEnv('SLACK_OAUTH_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    case 'hubspot': {
      const clientId = process.env.HUBSPOT_OAUTH_CLIENT_ID?.trim();
      const clientSecret = process.env.HUBSPOT_OAUTH_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('HUBSPOT_OAUTH_CLIENT_ID', clientId),
        clientSecret: requireEnv('HUBSPOT_OAUTH_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    case 'xero': {
      const clientId = process.env.XERO_OAUTH_CLIENT_ID?.trim();
      const clientSecret = process.env.XERO_OAUTH_CLIENT_SECRET?.trim();
      return {
        clientId: requireEnv('XERO_OAUTH_CLIENT_ID', clientId),
        clientSecret: requireEnv('XERO_OAUTH_CLIENT_SECRET', clientSecret),
        callbackUrl,
      };
    }
    default:
      throw new Error('OAuth Provider ist nicht verfuegbar');
  }
}

function asForm(data: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) body.set(key, value);
  return body.toString();
}

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: asForm(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('OAuth Token konnte nicht geladen werden');
  return response.json() as Promise<Record<string, unknown>>;
}

function pickToken(payload: Record<string, unknown>): OAuthExchangeResult {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : '';
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : undefined;
  const tokenType = typeof payload.token_type === 'string' ? payload.token_type : undefined;
  if (!accessToken) throw new Error('OAuth Access Token fehlt');
  return { accessToken, refreshToken, expiresInSeconds: expiresIn, tokenType, raw: payload };
}

const providers: Record<OAuthProviderId, OAuthProviderDefinition> = {
  'google-workspace': {
    id: 'google-workspace',
    buildAuthUrl: (config, params) => {
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', params.scopes.join(' '));
      url.searchParams.set('state', params.state);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('include_granted_scopes', 'true');
      url.searchParams.set('prompt', 'consent');
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(GOOGLE_TOKEN_URL, {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code',
      });
      return pickToken(payload);
    },
    refreshToken: async (config, refreshToken) => {
      const payload = await postForm(GOOGLE_TOKEN_URL, {
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      });
      // Google often omits refresh_token on refresh; preserve externally.
      return { ...pickToken(payload), refreshToken };
    },
    fetchIdentity: async (accessToken) => {
      const response = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Google Profil konnte nicht geladen werden');
      const payload = await response.json() as { email?: string; name?: string; sub?: string };
      return { accountIdentifier: payload.email || payload.name || payload.sub || 'Google Workspace', raw: payload };
    },
  },
  github: {
    id: 'github',
    buildAuthUrl: (config, params) => {
      const url = new URL(GITHUB_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('scope', params.scopes.join(' '));
      url.searchParams.set('state', params.state);
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(
        GITHUB_TOKEN_URL,
        {
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.callbackUrl,
        },
        { Accept: 'application/json' },
      );
      return pickToken(payload);
    },
    fetchIdentity: async (accessToken) => {
      const [userResponse, emailResponse] = await Promise.all([
        fetch(GITHUB_USER_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' }),
        fetch(GITHUB_EMAILS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' }),
      ]);
      if (!userResponse.ok) throw new Error('GitHub Profil konnte nicht geladen werden');
      const userPayload = await userResponse.json() as { login?: string; name?: string };
      const emailPayload = emailResponse.ok ? await emailResponse.json() as Array<{ email?: string; primary?: boolean }> : [];
      const primaryEmail = emailPayload.find((entry) => entry.primary)?.email || emailPayload[0]?.email || '';
      return { accountIdentifier: primaryEmail || userPayload.login || userPayload.name || 'GitHub', raw: { user: userPayload, emails: emailPayload } };
    },
  },
  'microsoft-graph': {
    id: 'microsoft-graph',
    buildAuthUrl: (config, params) => {
      const url = new URL(MS_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', params.scopes.join(' '));
      url.searchParams.set('state', params.state);
      url.searchParams.set('response_mode', 'query');
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(MS_TOKEN_URL, {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code',
      });
      return pickToken(payload);
    },
    refreshToken: async (config, refreshToken) => {
      const payload = await postForm(MS_TOKEN_URL, {
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: 'refresh_token',
      });
      return { ...pickToken(payload), refreshToken };
    },
    fetchIdentity: async (accessToken) => {
      const response = await fetch(MS_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Microsoft Profil konnte nicht geladen werden');
      const payload = await response.json() as { mail?: string; userPrincipalName?: string; displayName?: string; id?: string };
      return { accountIdentifier: payload.mail || payload.userPrincipalName || payload.displayName || payload.id || 'Microsoft', raw: payload };
    },
  },
  slack: {
    id: 'slack',
    buildAuthUrl: (config, params) => {
      const url = new URL(SLACK_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('scope', params.scopes.join(','));
      url.searchParams.set('state', params.state);
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(SLACK_TOKEN_URL, {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
      });
      const ok = Boolean(payload.ok);
      if (!ok) {
        const error = typeof payload.error === 'string' ? payload.error : 'Slack OAuth fehlgeschlagen';
        throw new Error(error);
      }
      const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
      const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : '';
      if (!accessToken) throw new Error('Slack Access Token fehlt');
      return { accessToken, refreshToken, raw: payload };
    },
    refreshToken: async (config, refreshToken) => {
      const payload = await postForm(SLACK_TOKEN_URL, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
      const ok = Boolean(payload.ok);
      if (!ok) {
        const error = typeof payload.error === 'string' ? payload.error : 'Slack Refresh fehlgeschlagen';
        throw new Error(error);
      }
      const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
      const nextRefresh = typeof payload.refresh_token === 'string' ? payload.refresh_token : refreshToken;
      if (!accessToken) throw new Error('Slack Access Token fehlt');
      return { accessToken, refreshToken: nextRefresh, raw: payload };
    },
    fetchIdentity: async (accessToken) => {
      const response = await fetch(SLACK_AUTH_TEST_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || payload.ok === false) throw new Error('Slack Workspace konnte nicht geladen werden');
      const team = typeof payload.team === 'string' ? payload.team : '';
      const user = typeof payload.user === 'string' ? payload.user : '';
      return { accountIdentifier: team || user || 'Slack', raw: payload };
    },
  },
  hubspot: {
    id: 'hubspot',
    buildAuthUrl: (config, params) => {
      const url = new URL(HUBSPOT_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('scope', params.scopes.join(' '));
      url.searchParams.set('state', params.state);
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(HUBSPOT_TOKEN_URL, {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        code,
      });
      return pickToken(payload);
    },
    refreshToken: async (config, refreshToken) => {
      const payload = await postForm(HUBSPOT_TOKEN_URL, {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        refresh_token: refreshToken,
      });
      return { ...pickToken(payload), refreshToken };
    },
    fetchIdentity: async (accessToken) => {
      const response = await fetch(`${HUBSPOT_TOKEN_INFO_URL}/${encodeURIComponent(accessToken)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('HubSpot Verbindung konnte nicht geladen werden');
      const payload = await response.json() as { hub_id?: number; user?: string; user_id?: number };
      const hub = typeof payload.hub_id === 'number' ? String(payload.hub_id) : '';
      const user = typeof payload.user === 'string' ? payload.user : '';
      const uid = typeof payload.user_id === 'number' ? String(payload.user_id) : '';
      return { accountIdentifier: user || hub || uid || 'HubSpot', raw: payload };
    },
  },
  xero: {
    id: 'xero',
    buildAuthUrl: (config, params) => {
      const url = new URL(XERO_AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', params.scopes.join(' '));
      url.searchParams.set('state', params.state);
      return url;
    },
    exchangeCode: async (config, code) => {
      const payload = await postForm(
        XERO_TOKEN_URL,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.callbackUrl,
        },
        {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
      );
      return pickToken(payload);
    },
    refreshToken: async (config, refreshToken) => {
      const payload = await postForm(
        XERO_TOKEN_URL,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
        {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
      );
      // Xero rotates refresh tokens.
      const token = pickToken(payload);
      return { ...token, refreshToken: token.refreshToken || refreshToken };
    },
    fetchIdentity: async (accessToken) => {
      const response = await fetch(XERO_CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Xero Verbindung konnte nicht geladen werden');
      const payload = await response.json() as Array<{ tenantName?: string; tenantId?: string }>;
      const first = Array.isArray(payload) ? payload[0] : undefined;
      return { accountIdentifier: first?.tenantName || first?.tenantId || 'Xero', raw: payload };
    },
  },
};

export function getOAuthProviderDefinition(id: OAuthProviderId): OAuthProviderDefinition {
  const provider = providers[id];
  if (!provider) throw new Error('OAuth Provider ist nicht verfuegbar');
  return provider;
}
