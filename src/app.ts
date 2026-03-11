import express from 'express';
import { createBillingRouter } from './modules/billing/billing.routes';
import { createStripeRouter } from './modules/stripe/stripe.routes';
import { createWalletRouter } from './modules/wallet/wallet.routes';
import { createAgentsRouter } from './modules/agents/agents.routes';
import { createReportingRouter } from './modules/reporting/reporting.routes';
import { createAdminRouter } from './modules/admin/admin.routes';

export function createBillingApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', createBillingRouter());
  app.use('/api', createWalletRouter());
  app.use('/api', createAgentsRouter());
  app.use('/api', createReportingRouter());
  app.use('/api', createAdminRouter());
  app.use('/api', createStripeRouter());
  return app;
}
