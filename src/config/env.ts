type NumericEnv = {
  PORT: number;
  MIN_TOPUP_EUR: number;
  MAX_TOPUP_EUR: number;
  CREDIT_MULTIPLIER: number;
  API_BUDGET_RATIO: number;
  RESERVE_RATIO: number;
  LOW_BALANCE_THRESHOLD_RATIO: number;
};

type StringEnv = {
  DATABASE_URL: string;
  MYSQL_HOST: string;
  MYSQL_PORT: string;
  MYSQL_DATABASE: string;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SUCCESS_URL: string;
  STRIPE_CANCEL_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_ORG_ID: string;
  OPENAI_PROJECT: string;
};

function readString(name: keyof StringEnv, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function readNumber(name: keyof NumericEnv, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  PORT: readNumber('PORT', 4100),
  DATABASE_URL: readString('DATABASE_URL'),
  MYSQL_HOST: readString('MYSQL_HOST'),
  MYSQL_PORT: readString('MYSQL_PORT', '3306'),
  MYSQL_DATABASE: readString('MYSQL_DATABASE'),
  MYSQL_USER: readString('MYSQL_USER'),
  MYSQL_PASSWORD: readString('MYSQL_PASSWORD'),
  STRIPE_SECRET_KEY: readString('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: readString('STRIPE_WEBHOOK_SECRET'),
  STRIPE_SUCCESS_URL: readString('STRIPE_SUCCESS_URL', 'http://localhost:3000/usage-token?payment=success&session_id={CHECKOUT_SESSION_ID}'),
  STRIPE_CANCEL_URL: readString('STRIPE_CANCEL_URL', 'http://localhost:3000/usage-token?payment=cancelled'),
  OPENAI_API_KEY: readString('OPENAI_API_KEY'),
  OPENAI_ORG_ID: readString('OPENAI_ORG_ID'),
  OPENAI_PROJECT: readString('OPENAI_PROJECT'),
  MIN_TOPUP_EUR: readNumber('MIN_TOPUP_EUR', 5),
  MAX_TOPUP_EUR: readNumber('MAX_TOPUP_EUR', 500),
  CREDIT_MULTIPLIER: readNumber('CREDIT_MULTIPLIER', 1000),
  API_BUDGET_RATIO: readNumber('API_BUDGET_RATIO', 0.7),
  RESERVE_RATIO: readNumber('RESERVE_RATIO', 0.3),
  LOW_BALANCE_THRESHOLD_RATIO: readNumber('LOW_BALANCE_THRESHOLD_RATIO', 0.2),
};

export function hasPostgresConfig(): boolean {
  return Boolean(env.DATABASE_URL) || Boolean(env.MYSQL_HOST && env.MYSQL_DATABASE && env.MYSQL_USER);
}

export function getBillingDbKind(): 'postgres' | 'mysql' | null {
  const databaseUrl = env.DATABASE_URL.toLowerCase();
  if (databaseUrl.startsWith('mysql://')) return 'mysql';
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) return 'postgres';
  if (env.MYSQL_HOST && env.MYSQL_DATABASE && env.MYSQL_USER) return 'mysql';
  if (env.DATABASE_URL) return 'postgres';
  return null;
}

export function hasStripeConfig(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function hasOpenAiConfig(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function amountEurToCredits(amountEur: number): number {
  return Math.round(amountEur * env.CREDIT_MULTIPLIER);
}

export function centsToEur(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export function eurToCents(amountEur: number): number {
  return Math.round(amountEur * 100);
}

export function formatEuro(amountEur: number): string {
  return `${amountEur.toFixed(2)} EUR`;
}
