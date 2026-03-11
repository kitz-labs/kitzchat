'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CreditCard, Users } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type UserRecord = {
  id: number;
  username: string;
  role: string;
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  plan_amount_cents?: number | null;
  wallet_balance_cents?: number | null;
  created_at: string;
};

export default function CustomersPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [users, setUsers] = useState<UserRecord[]>([]);

  useEffect(() => {
    if (!ready) return;

    let alive = true;

    (async () => {
      try {
        const payload = await fetch('/api/users', { cache: 'no-store' }).then((response) => response.json());
        if (!alive) return;
        setUsers(Array.isArray(payload?.users) ? payload.users : []);
      } catch {
        if (!alive) return;
        setUsers([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  const customers = users.filter((user) => user.account_type === 'customer');
  const paidCustomers = customers.filter((user) => user.payment_status === 'paid');
  const pendingCustomers = customers.filter((user) => user.payment_status === 'pending');

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<Users size={16} />} label="Kunden" value={String(customers.length)} />
        <SummaryCard icon={<CreditCard size={16} />} label="Bezahlt" value={String(paidCustomers.length)} />
        <SummaryCard icon={<CreditCard size={16} />} label="Ausstehend" value={String(pendingCustomers.length)} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Kunden</h1>
            <p className="text-xs text-muted-foreground">Admin-Uebersicht aller registrierten Kundenkonten und ihres Zahlungsstatus.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4">Kunde</th>
                  <th className="pb-3 pr-4">Rolle</th>
                  <th className="pb-3 pr-4">Zahlung</th>
                  <th className="pb-3 pr-4">Plan</th>
                  <th className="pb-3 pr-4">Guthaben</th>
                  <th className="pb-3">Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-border/50">
                    <td className="py-3 pr-4 font-medium">
                      <Link href={`/customers/${customer.id}`} className="hover:underline">
                        {customer.username}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{customer.role}</td>
                    <td className="py-3 pr-4">
                      <span className={`badge border ${customer.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        {customer.payment_status === 'paid' ? 'bezahlt' : 'ausstehend'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      €{((customer.plan_amount_cents ?? 0) / 100).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      €{((customer.wallet_balance_cents ?? 0) / 100).toFixed(2)}
                    </td>
                    <td className="py-3 text-muted-foreground">{new Date(customer.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel">
      <div className="panel-body flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}