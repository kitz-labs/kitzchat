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
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadUsers() {
    const payload = await fetch('/api/users', { cache: 'no-store' }).then((response) => response.json());
    setUsers(Array.isArray(payload?.users) ? payload.users : []);
  }

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

  async function createCustomer() {
    if (!username.trim() || !password.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email: email || null,
          accountType: 'customer',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Kunde konnte nicht erstellt werden'));
      setUsername('');
      setEmail('');
      setPassword('');
      await loadUsers();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Kunde konnte nicht erstellt werden');
    } finally {
      setCreating(false);
    }
  }

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        <div className="panel-body border-b border-border/50 space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Benutzername</div>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">E-Mail</div>
              <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Passwort</div>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={createCustomer} disabled={creating} className="btn btn-primary w-full text-sm">
                {creating ? 'Erstelle...' : 'Kunden erstellen'}
              </button>
            </div>
          </div>
          {createError ? <div className="text-sm text-destructive">{createError}</div> : null}
        </div>
        <div className="panel-body">
          <div className="grid gap-3 md:hidden">
            {customers.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="card card-hover p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{customer.username}</div>
                    <div className="text-xs text-muted-foreground">{customer.role}</div>
                  </div>
                  <span className={`badge border ${customer.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    {customer.payment_status === 'paid' ? 'bezahlt' : 'ausstehend'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <MiniInfo label="Plan" value={`€${((customer.plan_amount_cents ?? 0) / 100).toFixed(2)}`} />
                  <MiniInfo label="Guthaben" value={`€${((customer.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
                </div>
                <div className="text-xs text-muted-foreground">Erstellt {new Date(customer.created_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
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

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}