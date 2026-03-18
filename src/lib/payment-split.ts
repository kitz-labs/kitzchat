export type PaymentSplit = {
  grossAmountCents: number;
  usageBudgetCents: number;
  adminShareCents: number;
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function splitGrossAmountCents(grossAmountCents: number, adminShareRatio: number): PaymentSplit {
  const gross = Math.max(0, Math.round(Number(grossAmountCents) || 0));
  const ratio = clampRatio(Number(adminShareRatio) || 0);

  // Make rounding deterministic, guarantee exact sum equality.
  const adminShareCents = Math.max(0, Math.min(gross, Math.round(gross * ratio)));
  const usageBudgetCents = gross - adminShareCents;

  return {
    grossAmountCents: gross,
    usageBudgetCents,
    adminShareCents,
  };
}

