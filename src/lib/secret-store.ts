import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SECRET_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function getConfiguredSecret(): string | null {
  const explicit = process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY?.trim();
  if (explicit) return explicit;
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) return apiKey;
  return null;
}

export function getSecretEncryptionSource(): 'dedicated' | 'api_key' | 'missing' {
  if (process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY?.trim()) return 'dedicated';
  if (process.env.API_KEY?.trim()) return 'api_key';
  return 'missing';
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function isSecretEncryptionAvailable(): boolean {
  return Boolean(getConfiguredSecret());
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(SECRET_PREFIX);
}

export function encryptSecret(value: string | null | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (isEncryptedSecret(normalized)) return normalized;

  const secret = getConfiguredSecret();
  if (!secret) return normalized;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

export function decryptSecret(value: string | null | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (!isEncryptedSecret(normalized)) return normalized;

  const secret = getConfiguredSecret();
  if (!secret) {
    throw new Error('secret_store_unavailable');
  }

  const payload = normalized.slice(SECRET_PREFIX.length);
  const [ivPart, tagPart, encryptedPart] = payload.split('.');
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('secret_store_invalid_payload');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), fromBase64Url(ivPart));
  decipher.setAuthTag(fromBase64Url(tagPart));
  const decrypted = Buffer.concat([decipher.update(fromBase64Url(encryptedPart)), decipher.final()]);
  return decrypted.toString('utf8');
}
