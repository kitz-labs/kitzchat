type WebDavTestResult = {
  ok: boolean;
  status: number;
  url: string;
  hint?: string;
  details?: {
    server?: string | null;
    dav?: string | null;
    wwwAuthenticate?: string | null;
  };
};

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('cloud_login_url_missing');
  const url = new URL(trimmed);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('cloud_login_url_invalid');
  return url.toString();
}

function joinUrl(base: string, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return base;
  if (/^https?:\/\//i.test(trimmed)) return normalizeUrl(trimmed);

  const baseUrl = new URL(normalizeUrl(base));
  if (trimmed.startsWith('/')) {
    baseUrl.pathname = trimmed;
  } else {
    const withSlash = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
    baseUrl.pathname = `${withSlash}${trimmed}`;
  }
  return baseUrl.toString();
}

function looksLikeOwncloudShareLink(value: string): boolean {
  return /\/index\.php\/f\/[a-z0-9]+/i.test(value.trim());
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export async function testWebDav(params: {
  baseUrl: string;
  username: string;
  password: string;
  folder?: string;
}): Promise<WebDavTestResult> {
  const baseUrl = normalizeUrl(params.baseUrl);
  const username = params.username.trim();
  const password = params.password.trim();
  const folder = (params.folder || '').trim();

  if (!username || !password) {
    return { ok: false, status: 0, url: baseUrl, hint: 'cloud_credentials_missing' };
  }

  if (folder && looksLikeOwncloudShareLink(folder)) {
    return {
      ok: false,
      status: 0,
      url: baseUrl,
      hint: 'folder_link_is_share_url',
    };
  }

  const targetUrl = joinUrl(baseUrl, folder);
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  // PROPFIND is the standard WebDAV liveness check; ownCloud/Nextcloud return 207.
  const response = await fetchWithTimeout(targetUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${auth}`,
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>\n<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      hint: message.includes('AbortError') ? 'timeout' : 'network_error',
    } satisfies WebDavTestResult;
  });

  if (typeof (response as any)?.ok === 'boolean') {
    const r = response as Response;
    const status = r.status;
    const ok = status === 207 || status === 200 || status === 204;
    const server = r.headers.get('server');
    const dav = r.headers.get('dav');
    const wwwAuthenticate = r.headers.get('www-authenticate');

    let hint: string | undefined;
    if (!ok) {
      if (status === 401 || status === 403) hint = 'auth_failed';
      else if (status === 404) hint = 'not_found';
      else hint = 'webdav_check_failed';
    }

    return {
      ok,
      status,
      url: targetUrl,
      hint,
      details: { server, dav, wwwAuthenticate },
    };
  }

  return response as WebDavTestResult;
}

