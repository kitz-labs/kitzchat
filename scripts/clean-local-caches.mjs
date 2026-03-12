import { rm } from 'node:fs/promises';
import path from 'node:path';

const targets = [
  '.next',
  'tsconfig.tsbuildinfo',
];

async function removeWithRetry(resolved) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if ((code === 'ENOTEMPTY' || code === 'EBUSY') && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

for (const target of targets) {
  const resolved = path.resolve(process.cwd(), target);
  await removeWithRetry(resolved);
  console.log(`Cleared local cache: ${target}`);
}