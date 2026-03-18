export const DEFAULT_CREDIT_MULTIPLIER = 1000;

function normalizeMultiplier(multiplier?: number): number {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CREDIT_MULTIPLIER;
  return Math.round(value);
}

export function eurToCredits(amountEur: number, multiplier?: number): number {
  const eur = Number(amountEur);
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  return Math.round(eur * normalizeMultiplier(multiplier));
}

export function centsToCredits(amountCents: number, multiplier?: number): number {
  const cents = Math.max(0, Math.round(Number(amountCents)));
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.round((cents / 100) * normalizeMultiplier(multiplier));
}

export function creditsToCents(credits: number, multiplier?: number): number {
  const value = Number(credits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value / normalizeMultiplier(multiplier)) * 100);
}

export function creditsToEur(credits: number, multiplier?: number): number {
  const value = Number(credits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / normalizeMultiplier(multiplier);
}

