import premiumSnapshot from '@/data/public-apis-premium.json';

export type PublicApisPremiumSource = {
  repo: string;
  url: string;
  syncedAt: string; // YYYY-MM-DD
  readme: string;
};

export type PublicApisPremiumEntry = {
  category: string;
  name: string;
  url: string;
  description: string;
  auth: string; // apiKey | OAuth | No | Unknown | ...
  https: string; // Yes | No | ...
  cors: string; // Yes | No | Unknown
};

export const PUBLIC_APIS_PREMIUM_SOURCE = premiumSnapshot.source as PublicApisPremiumSource;
export const PUBLIC_APIS_PREMIUM_ENTRIES = premiumSnapshot.entries as PublicApisPremiumEntry[];

const PROVIDER_INDEX = new Map<string, PublicApisPremiumEntry>(
  PUBLIC_APIS_PREMIUM_ENTRIES.map((entry) => [normalizeProviderName(entry.name), entry]),
);

function normalizeProviderName(value: string): string {
  return value.trim().toLowerCase();
}

export function findPublicApisPremiumEntry(providerName: string): PublicApisPremiumEntry | null {
  if (!providerName?.trim()) return null;
  return PROVIDER_INDEX.get(normalizeProviderName(providerName)) ?? null;
}

export function listPublicApisPremiumProviderNames(): string[] {
  return PUBLIC_APIS_PREMIUM_ENTRIES.map((entry) => entry.name).slice().sort((a, b) => a.localeCompare(b));
}

export function groupPublicApisPremiumByCategory(): Record<string, PublicApisPremiumEntry[]> {
  const grouped: Record<string, PublicApisPremiumEntry[]> = {};
  for (const entry of PUBLIC_APIS_PREMIUM_ENTRIES) {
    (grouped[entry.category] ??= []).push(entry);
  }
  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

