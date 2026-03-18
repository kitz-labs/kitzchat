import { env } from '@/config/env';

type OpenAiAdminConfig = {
  configured: boolean;
  projectId: string | null;
  usdToEur: number;
};

export function getOpenAiAdminConfig(): OpenAiAdminConfig {
  const projectId = env.OPENAI_PROJECT?.trim() || null;
  const configured = Boolean(env.OPENAI_ADMIN_KEY?.trim() && projectId);
  const usdToEur = Number.isFinite(env.OPENAI_USD_TO_EUR) && env.OPENAI_USD_TO_EUR > 0 ? env.OPENAI_USD_TO_EUR : 0.92;
  return { configured, projectId, usdToEur };
}

function assertConfigured() {
  if (!env.OPENAI_ADMIN_KEY?.trim()) throw new Error('openai_admin_key_missing');
}

function buildSearchParams(query: Record<string, string | number | boolean | string[] | number[] | undefined | null>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

async function openAiAdminGetJson<T>(pathname: string, query: Record<string, any>): Promise<T> {
  assertConfigured();
  const base = 'https://api.openai.com';
  const url = new URL(pathname, base);
  url.search = buildSearchParams(query).toString();
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.OPENAI_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`openai_admin_failed:${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type CursorPage<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string | null;
};

export type OpenAiCostBucket = {
  start_time: number;
  end_time: number;
  results: Array<{
    amount?: { value?: number; currency?: string };
    project_id?: string;
    line_item?: string;
  }>;
};

type OpenAiCostsResponse = CursorPage<{
  start_time?: number;
  end_time?: number;
  results?: OpenAiCostBucket['results'];
}>;

export async function fetchOpenAiCosts(params: {
  startTimeSec: number;
  endTimeSec: number;
  projectId: string;
}): Promise<OpenAiCostBucket[]> {
  const buckets: OpenAiCostBucket[] = [];
  let page: string | null = null;

  // API docs indicate bucket_width=1d and limit up to 31 (pagination via cursor).
  for (let guard = 0; guard < 200; guard += 1) {
    const res: OpenAiCostsResponse = await openAiAdminGetJson<OpenAiCostsResponse>('/v1/organization/costs', {
      start_time: params.startTimeSec,
      end_time: params.endTimeSec,
      bucket_width: '1d',
      limit: 31,
      ...(page ? { page } : {}),
      'project_ids[]': [params.projectId],
      'group_by[]': ['project_id', 'line_item'],
    });

    const data = Array.isArray(res?.data) ? res.data : [];
    for (const item of data) {
      const start = Number(item?.start_time);
      const end = Number(item?.end_time);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const results = Array.isArray(item?.results) ? item.results : [];
      buckets.push({
        start_time: start,
        end_time: end,
        results: results.map((r: any) => ({
          amount: r?.amount,
          project_id: r?.project_id,
          line_item: r?.line_item,
        })),
      });
    }

    if (!res?.has_more) break;
    page = typeof res?.next_page === 'string' && res.next_page ? res.next_page : null;
    if (!page) break;
  }

  buckets.sort((a, b) => a.start_time - b.start_time);
  return buckets;
}

export type OpenAiUsageBucket = {
  start_time: number;
  end_time: number;
  results: Array<{
    project_id?: string;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    num_requests?: number;
  }>;
};

type OpenAiCompletionsUsageResponse = CursorPage<{
  start_time?: number;
  end_time?: number;
  results?: Array<Record<string, unknown>>;
}>;

export async function fetchOpenAiCompletionsUsage(params: {
  startTimeSec: number;
  endTimeSec: number;
  projectId: string;
}): Promise<OpenAiUsageBucket[]> {
  const buckets: OpenAiUsageBucket[] = [];
  let page: string | null = null;

  for (let guard = 0; guard < 400; guard += 1) {
    const res: OpenAiCompletionsUsageResponse = await openAiAdminGetJson<OpenAiCompletionsUsageResponse>('/v1/organization/usage/completions', {
      start_time: params.startTimeSec,
      end_time: params.endTimeSec,
      bucket_width: '1d',
      limit: 31,
      ...(page ? { page } : {}),
      'project_ids[]': [params.projectId],
      'group_by[]': ['project_id', 'model'],
    });

    const data = Array.isArray(res?.data) ? res.data : [];
    for (const item of data) {
      const start = Number(item?.start_time);
      const end = Number(item?.end_time);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const resultsRaw = Array.isArray(item?.results) ? item.results : [];
      const results = resultsRaw.map((r: any) => ({
        project_id: typeof r?.project_id === 'string' ? r.project_id : undefined,
        model: typeof r?.model === 'string' ? r.model : undefined,
        input_tokens: Number.isFinite(Number(r?.input_tokens)) ? Number(r.input_tokens) : undefined,
        output_tokens: Number.isFinite(Number(r?.output_tokens)) ? Number(r.output_tokens) : undefined,
        total_tokens: Number.isFinite(Number(r?.total_tokens)) ? Number(r.total_tokens) : undefined,
        num_requests: Number.isFinite(Number(r?.num_requests)) ? Number(r.num_requests) : undefined,
      }));
      buckets.push({ start_time: start, end_time: end, results });
    }

    if (!res?.has_more) break;
    page = typeof res?.next_page === 'string' && res.next_page ? res.next_page : null;
    if (!page) break;
  }

  buckets.sort((a, b) => a.start_time - b.start_time);
  return buckets;
}
