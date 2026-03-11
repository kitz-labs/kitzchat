import type { Request, Response } from 'express';
import { getCustomerReporting } from './reporting.service';

export async function getCustomerReportingHttp(req: Request, res: Response) {
  const userId = Number(req.params.userId);
  res.json(await getCustomerReporting(userId));
}
