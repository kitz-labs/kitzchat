'use client';

import { CustomerAgents } from '@/components/customer/customer-agents';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

export default function AgentsPage() {
  const { ready, appAudience } = useAudienceGuard({
    redirectAdminTo: '/agents/squads',
    redirectOnErrorTo: '/agents/squads',
  });

  if (!ready) return <div className="min-h-[40vh]" />;
  if (appAudience !== 'customer') return null;
  return <CustomerAgents />;
}
