import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireAdmin } from '@/lib/auth';
import { getSeedCount } from '@/lib/queries';
import { getSupportDbOverview } from '@/lib/support';
import { hasPostgresConfig, getBillingDbKind } from '@/config/env';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

const BILLING_TABLES = [
  'users',
  'wallets',
  'wallet_ledger',
  'payments',
  'payment_allocations',
  'entitlements',
  'usage_runs',
  'webhook_events',
  'model_routing_rules',
  'topup_offers',
  'ui_messages',
  'feature_flags',
  'agent_price_rules',
  'webhook_event_types',
];

export async function GET(request: Request) {
  try {
    requireAdmin(request);

    const sqlite = getSupportDbOverview();
    let dbSizeMb = 0;
    try {
      dbSizeMb = fs.statSync(sqlite.db_path).size / (1024 * 1024);
    } catch {
      dbSizeMb = 0;
    }

    let billing: {
      configured: boolean;
      kind: 'postgres' | 'mysql' | null;
      health: 'ok' | 'error' | 'unconfigured';
      error?: string;
      tables: Array<{ name: string; count: number }>;
    } = {
      configured: false,
      kind: null,
      health: 'unconfigured',
      tables: [],
    };

    if (hasPostgresConfig()) {
      try {
        const tables = [] as Array<{ name: string; count: number }>;
        await queryPg('SELECT 1 AS ok');
        for (const name of BILLING_TABLES) {
          try {
            const result = await queryPg<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${name}`);
            tables.push({ name, count: Number(result.rows[0]?.count ?? 0) });
          } catch {
            tables.push({ name, count: 0 });
          }
        }
        billing = {
          configured: true,
          kind: getBillingDbKind(),
          health: 'ok',
          tables,
        };
      } catch (error) {
        billing = {
          configured: true,
          kind: getBillingDbKind(),
          health: 'error',
          error: error instanceof Error ? error.message : 'billing_unavailable',
          tables: [],
        };
      }
    }

    return NextResponse.json({
      sqlite: {
        ...sqlite,
        db_size_mb: dbSizeMb,
        seed_count: getSeedCount(),
      },
      billing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load database overview';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load database overview' }, { status: 500 });
  }
}