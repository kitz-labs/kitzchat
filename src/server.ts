import { createServer } from 'node:http';
import { createBillingApp } from './app';
import { ensureBillingInfrastructure, seedBillingReferenceData } from './config/db';
import { env } from './config/env';

async function main() {
  const args = new Set(process.argv.slice(2));
  await ensureBillingInfrastructure();

  if (args.has('--migrate-only')) {
    return;
  }

  if (args.has('--seed-only')) {
    await seedBillingReferenceData();
    return;
  }

  const app = createBillingApp();
  const server = createServer(app);
  server.listen(env.PORT, () => {
    console.log(`Billing server listening on :${env.PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});