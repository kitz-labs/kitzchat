import { rm } from 'node:fs/promises';
import path from 'node:path';

const targets = [
  '.next',
  'tsconfig.tsbuildinfo',
];

for (const target of targets) {
  const resolved = path.resolve(process.cwd(), target);
  await rm(resolved, { recursive: true, force: true });
  console.log(`Cleared local cache: ${target}`);
}