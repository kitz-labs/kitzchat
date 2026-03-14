#!/usr/bin/env node
import { listUsers, updateCustomerPaymentStatus } from '@/lib/auth';
import { ensureStripeCustomerForUser } from '@/modules/stripe/stripe.service';
import { ensureBillingUser } from '@/modules/wallet/wallet.service';

async function main() {
  console.log('Loading customers...');
  const users = listUsers().filter((u) => u.account_type === 'customer');
  console.log(`Found ${users.length} customers`);

  const results: Array<{ id: number; username: string; ok: boolean; err?: string }>= [];

  for (const u of users) {
    try {
      process.stdout.write(`Processing ${u.username} (${u.id})... `);
      const stripeCustomerId = await ensureStripeCustomerForUser({
        userId: u.id,
        username: u.username,
        email: u.email ?? null,
        stripeCustomerId: u.stripe_customer_id ?? null,
      });

      await ensureBillingUser({
        userId: u.id,
        email: u.email ?? null,
        name: u.username,
        stripeCustomerId: stripeCustomerId ?? null,
        chatEnabled: true,
      });

      try {
        updateCustomerPaymentStatus(u.id, 'paid');
      } catch (e) {
        // best-effort; continue
      }

      console.log('done');
      results.push({ id: u.id, username: u.username, ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`FAILED for ${u.username} (${u.id}): ${msg}`);
      results.push({ id: u.id, username: u.username, ok: false, err: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${okCount}/${results.length} customers processed successfully.`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(` - ${f.username} (${f.id}): ${f.err}`);
    process.exitCode = 2;
  } else {
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
