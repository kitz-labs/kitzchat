import { Router } from 'express';
import { getCustomerReportingHttp } from './reporting.controller';

export function createReportingRouter(): Router {
  const router = Router();
  router.get('/admin/reporting/customer/:userId', getCustomerReportingHttp);
  return router;
}
