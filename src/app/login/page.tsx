'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/layout/brand-logo';

const CUSTOMER_ALLOWED_PATHS = new Set(['/', '/agents', '/usage-token', '/settings', '/hilfe', '/nutzungshinweise', '/datenschutz']);

type LoginResponse = {
  user?: {
    account_type?: 'staff' | 'customer';
    payment_status?: 'not_required' | 'pending' | 'paid';
    accepted_terms_at?: string | null;
  };
};

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const msg = searchParams.get('error');
    if (msg) setError(msg);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data) => setGoogleEnabled(Boolean(data?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  function resolveRedirect(data: LoginResponse): string {
    const requestedPath = searchParams.get('from');
    const accountType = data.user?.account_type;
    const paymentStatus = data.user?.payment_status;
    const defaultPath = accountType === 'customer'
      ? (paymentStatus !== 'paid' ? '/usage-token?onboarding=1' : '/')
      : '/';

    if (!requestedPath || !requestedPath.startsWith('/')) {
      return defaultPath;
    }

    if (accountType === 'customer') {
      const [pathname] = requestedPath.split('?');
      return CUSTOMER_ALLOWED_PATHS.has(pathname) ? requestedPath : defaultPath;
    }

    return requestedPath;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as LoginResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Login fehlgeschlagen');
        return;
      }

      window.location.href = resolveRedirect(data);
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
          Benutzername
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          autoFocus
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          required
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Anmeldung läuft...' : 'Anmelden'}
      </button>

      {googleEnabled && (
        <a
          href={`/api/auth/google/start?from=${encodeURIComponent(searchParams.get('from') || '/')}`}
          className="block w-full py-2.5 rounded-lg border border-[var(--border)] text-center text-sm font-medium hover:bg-[var(--muted)] transition-colors"
        >
          Mit Google anmelden
        </a>
      )}

      <div className="text-center text-xs text-muted-foreground">
        Noch kein Konto? <Link className="text-primary hover:underline" href="/register">Registrieren</Link>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Testkunde lokal: <span className="font-mono text-foreground">test / test</span>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm p-8 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandLogo compact />
          </div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">KitzChat</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">Lokaler KI-Arbeitsbereich</p>
        </div>

        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
