import { rm } from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/clean-next-dev-cache.mjs <dist-dir>');
  process.exit(1);
}

const distDir = path.resolve(process.cwd(), target);

try {
  await rm(distDir, { recursive: true, force: true });
  console.log(`Cleared Next dev cache: ${target}`);
} catch (error) {
  console.error(`Failed to clear Next dev cache for ${target}:`, error);
  process.exit(1);
}