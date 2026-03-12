export type WalletPayloadBase = {
  balance: number;
  currencyDisplay: string;
  status: string;
  lowBalanceWarning: boolean;
  premiumModeMessage: string;
};

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function normalizeWalletPayload<T extends Record<string, unknown> = Record<string, never>>(value: unknown): (WalletPayloadBase & Partial<T>) | null {
  if (!value || typeof value !== 'object') return null;

  const payload = value as Record<string, unknown>;
  if ('error' in payload && !('balance' in payload)) {
    return null;
  }

  return {
    ...payload,
    balance: asFiniteNumber(payload.balance, 0),
    currencyDisplay: asString(payload.currencyDisplay, 'Credits'),
    status: asString(payload.status, 'inactive'),
    lowBalanceWarning: Boolean(payload.lowBalanceWarning),
    premiumModeMessage: asString(payload.premiumModeMessage, 'Wallet derzeit nicht verfuegbar'),
  } as WalletPayloadBase & Partial<T>;
}