import { NextRequest, NextResponse } from "next/server";
import { getDailyMetrics } from "@/lib/queries";
import { requireApiUser } from "@/lib/api-auth";
import { clampDays, computeSocialAnalytics, isSafeExternalUrl } from "@/lib/analytics";
import { fetchPlausibleWebsiteAnalytics } from "@/lib/plausible";
import { fetchGa4WebsiteAnalytics } from "@/lib/ga4";

type ProviderState = {
  provider: string;
  configured: boolean;
  error?: string;
  health?: {
    latency_ms?: number;
    attempts?: number;
    retry_count?: number;
    last_success_at?: string;
    last_error_at?: string;
    stale_after_seconds?: number;
    next_retry_after_seconds?: number;
  };
  [key: string]: unknown;
};

type ProviderRunResult<T> =
  | {
      ok: true;
      data: T;
      latencyMs: number;
      attempts: number;
      retryCount: number;
      lastSuccessAt: string;
    }
  | {
      ok: false;
      error: string;
      latencyMs: number;
      attempts: number;
      retryCount: number;
      lastErrorAt: string;
    };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProviderWithRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; retryDelayMs?: number } = {},
): Promise<ProviderRunResult<T>> {
  const maxAttempts = Math.max(1, opts.attempts ?? 2);
  const retryDelayMs = Math.max(0, opts.retryDelayMs ?? 250);
  const startedAt = Date.now();

  let attempts = 0;
  let lastError = 'Unknown provider error';

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const data = await fn();
      return {
        ok: true,
        data,
        latencyMs: Date.now() - startedAt,
        attempts,
        retryCount: Math.max(0, attempts - 1),
        lastSuccessAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempts < maxAttempts) {
        await delay(retryDelayMs * attempts);
      }
    }
  }

  return {
    ok: false,
    error: lastError,
    latencyMs: Date.now() - startedAt,
    attempts,
    retryCount: Math.max(0, attempts - 1),
    lastErrorAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as Request);
  if (auth) return auth;

  const { searchParams } = req.nextUrl;
  const days = clampDays(searchParams.get("days"), 30);
  const real = searchParams.get("real") === "true";

  const rawDaily = getDailyMetrics(days, { excludeSeed: real });
  const dailyAsc = [...rawDaily].reverse();
  const social = computeSocialAnalytics(dailyAsc);

  const websiteIframeUrlRaw = process.env.KITZCHAT_ANALYTICS_WEBSITE_IFRAME_URL;
  const socialIframeUrlRaw = process.env.KITZCHAT_ANALYTICS_SOCIAL_IFRAME_URL;
  const websiteIframeUrl = isSafeExternalUrl(websiteIframeUrlRaw) ? websiteIframeUrlRaw : null;
  const socialIframeUrl = isSafeExternalUrl(socialIframeUrlRaw) ? socialIframeUrlRaw : null;

  // Website analytics preference: GA4 -> Plausible -> embed.
  const ga4PropertyId = process.env.GA4_PROPERTY_ID || process.env.GA4_PROPERTY || null;
  const ga4ServiceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON || null;
  const ga4ServiceAccountJsonB64 = process.env.GA4_SERVICE_ACCOUNT_JSON_B64 || null;

  const plausibleSiteId = process.env.PLAUSIBLE_SITE_ID;
  const plausibleApiKey = process.env.PLAUSIBLE_API_KEY;
  const plausibleBaseUrl = process.env.PLAUSIBLE_BASE_URL || "https://plausible.io";

  let website: ProviderState = { provider: "none", configured: false };

  if (ga4PropertyId && (ga4ServiceAccountJson || ga4ServiceAccountJsonB64)) {
    const ga4Run = await runProviderWithRetry(() => fetchGa4WebsiteAnalytics({
        propertyId: ga4PropertyId,
        days,
        serviceAccountJson: ga4ServiceAccountJson,
        serviceAccountJsonB64: ga4ServiceAccountJsonB64,
      }));
    if (ga4Run.ok) {
      const ga4 = ga4Run.data;
      website = {
        provider: "ga4",
        configured: true,
        summary: ga4.summary,
        series: ga4.series,
        topPages: ga4.topPages,
        trafficSources: ga4.trafficSources,
        deviceSplit: ga4.deviceSplit,
        newVsReturning: ga4.newVsReturning,
        countries: ga4.countries,
        health: {
          latency_ms: ga4Run.latencyMs,
          attempts: ga4Run.attempts,
          retry_count: ga4Run.retryCount,
          last_success_at: ga4Run.lastSuccessAt,
          stale_after_seconds: 3_600,
          next_retry_after_seconds: 300,
        },
      };
    } else {
      website = {
        provider: "ga4",
        configured: false,
        error: ga4Run.error,
        health: {
          latency_ms: ga4Run.latencyMs,
          attempts: ga4Run.attempts,
          retry_count: ga4Run.retryCount,
          last_error_at: ga4Run.lastErrorAt,
          stale_after_seconds: 3_600,
          next_retry_after_seconds: 300,
        },
        ...(websiteIframeUrl ? { iframeUrl: websiteIframeUrl } : {}),
      };
    }
  } else if (plausibleSiteId && plausibleApiKey) {
    const plausibleRun = await runProviderWithRetry(() => fetchPlausibleWebsiteAnalytics({
        baseUrl: plausibleBaseUrl,
        siteId: plausibleSiteId,
        apiKey: plausibleApiKey,
        days,
      }));
    if (plausibleRun.ok) {
      const plausible = plausibleRun.data;
      website = {
        provider: "plausible",
        configured: true,
        summary: plausible.summary,
        series: plausible.series,
        health: {
          latency_ms: plausibleRun.latencyMs,
          attempts: plausibleRun.attempts,
          retry_count: plausibleRun.retryCount,
          last_success_at: plausibleRun.lastSuccessAt,
          stale_after_seconds: 3_600,
          next_retry_after_seconds: 300,
        },
      };
    } else {
      website = {
        provider: "plausible",
        configured: false,
        error: plausibleRun.error,
        health: {
          latency_ms: plausibleRun.latencyMs,
          attempts: plausibleRun.attempts,
          retry_count: plausibleRun.retryCount,
          last_error_at: plausibleRun.lastErrorAt,
          stale_after_seconds: 3_600,
          next_retry_after_seconds: 300,
        },
        ...(websiteIframeUrl ? { iframeUrl: websiteIframeUrl } : {}),
      };
    }
  } else if (websiteIframeUrl) {
    website = { provider: "iframe", configured: true, iframeUrl: websiteIframeUrl };
  } else {
    website = {
      provider: "none",
      configured: false,
      error:
        "Not configured. Set GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_JSON (recommended) or PLAUSIBLE_SITE_ID + PLAUSIBLE_API_KEY, or KITZCHAT_ANALYTICS_WEBSITE_IFRAME_URL.",
    };
  }

  return NextResponse.json({
    days,
    website,
    social: {
      provider: "internal",
      configured: true,
      summary: social.summary,
      series: social.series,
      iframeUrl: socialIframeUrl,
    },
  });
}
