import path from 'node:path';

export function getAppStateDir(): string {
  const configured = process.env.KITZCHAT_STATE_DIR;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  return path.join(process.cwd(), 'state');
}