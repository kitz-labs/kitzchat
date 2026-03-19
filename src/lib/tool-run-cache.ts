type CacheKey = string;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

/**
 * Small in-memory TTL cache with promise deduping (join concurrent identical runs).
 * Intended for tool/API calls to reduce latency and repeated billing.
 */
export class ToolRunCache {
  private maxEntries: number;
  private store = new Map<CacheKey, CacheEntry<unknown>>();
  private inflight = new Map<CacheKey, Promise<unknown>>();

  constructor(opts: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(50, Math.round(opts.maxEntries ?? 400));
  }

  get<T>(key: CacheKey): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: CacheKey, value: T, ttlMs: number) {
    const now = Date.now();
    this.store.set(key, { value, createdAt: now, expiresAt: now + Math.max(250, ttlMs) });
    this.evictIfNeeded();
  }

  async run<T>(key: CacheKey, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached != null) return cached;
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const value = await fn();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  private evictIfNeeded() {
    if (this.store.size <= this.maxEntries) return;
    // Evict oldest entries first.
    const entries = Array.from(this.store.entries());
    entries.sort((a, b) => (a[1].createdAt - b[1].createdAt));
    const toRemove = Math.max(1, Math.ceil(this.store.size - this.maxEntries));
    for (let i = 0; i < toRemove; i++) {
      const key = entries[i]?.[0];
      if (key) this.store.delete(key);
    }
  }
}

export function stableCacheKey(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => (p == null ? '' : String(p))).join('|');
}

