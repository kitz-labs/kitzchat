'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/layout/brand-logo';
import { AppFooter } from '@/components/layout/app-footer';
import { TokenUsageTicker } from '@/components/auth/token-usage-board';
import { Github } from 'lucide-react';
import { KeyRound } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';

const CUSTOMER_ALLOWED_PATHS = new Set(['/', '/agents', '/usage-token', '/settings', '/hilfe', '/downloads', '/support-chat', '/nutzungshinweise', '/datenschutz']);

type LoginResponse = {
  user?: {
    account_type?: 'staff' | 'customer';
    onboarding_completed_at?: string | null;
  };
};

function RegisterCard() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data) => setGithubEnabled(Boolean(data?.github)))
      .catch(() => setGithubEnabled(false));
  }, []);

  useEffect(() => {
    setPasskeySupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window);
  }, []);

  function resolveRedirect(data: LoginResponse): string {
    const requestedPath = searchParams.get('from');
    const accountType = data.user?.account_type;
    const onboardingCompleted = Boolean(data.user?.onboarding_completed_at);
    const defaultPath = accountType === 'customer'
      ? (onboardingCompleted ? '/' : '/usage-token?onboarding=1')
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

  async function handlePasskeyLogin() {
    setError('');
    setLoading(true);
    try {
      const optRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
      const optData = await optRes.json().catch(() => ({}));
      if (!optRes.ok) throw new Error(String(optData?.error || 'Passkey Optionen fehlgeschlagen'));

      const authResp = await startAuthentication(optData.options);
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResp }),
      });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as LoginResponse & { error?: string };
      if (!verifyRes.ok) throw new Error(String(verifyData?.error || 'Passkey Login fehlgeschlagen'));
      window.location.href = resolveRedirect(verifyData);
    } catch (err) {
      const msg = (err as Error).message || 'Passkey Login fehlgeschlagen';
      setError(msg.includes('AbortError') ? 'Abgebrochen' : msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setDone(false);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, first_name: firstName, last_name: lastName, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error || 'Registrierung fehlgeschlagen'));
        return;
      }
      setDone(true);
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/5 backdrop-blur-xl p-8 space-y-6 shadow-2xl">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-1"><BrandLogo compact /></div>
        <p className="text-sm text-white/60">Konto erstellen</p>
      </div>

      {passkeySupported && !done ? (
        <button
          type="button"
          onClick={() => handlePasskeyLogin()}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/15 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <KeyRound size={16} />
          Mit Passkey anmelden
        </button>
      ) : null}

      {githubEnabled && !done ? (
        <a
          href={`/api/auth/github/start?from=${encodeURIComponent(searchParams.get('from') || '/')}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/15 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors"
        >
          <Github size={16} />
          Mit GitHub fortfahren
        </a>
      ) : null}

      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/80">
            Wir haben dir eine E-Mail gesendet. Bitte bestaetige den Link, um dich anzumelden.
          </div>
          <Link href="/login" className="block w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold text-center hover:opacity-90 transition-opacity">
            Zum Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {githubEnabled || passkeySupported ? (
            <div className="flex items-center gap-3 text-xs text-white/40">
              <div className="h-px flex-1 bg-white/10" />
              oder
              <div className="h-px flex-1 bg-white/10" />
            </div>
          ) : null}
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1.5 text-white/90">Benutzername</label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium mb-1.5 text-white/90">Vorname *</label>
              <input
                id="first_name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium mb-1.5 text-white/90">Nachname *</label>
              <input
                id="last_name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="company" className="block text-sm font-medium mb-1.5 text-white/90">Firma (optional)</label>
            <input
              id="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              placeholder="z.B. AI Kitz Art & Labs"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-white/90">E-Mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5 text-white/90">Passwort</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
            <p className="mt-1 text-[11px] text-white/50">Für die lokale Entwicklung reichen 4+ Zeichen.</p>
          </div>
          {error ? <p className="text-sm text-red-200 bg-red-500/10 px-3 py-2 rounded-xl">{error}</p> : null}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50">
            {loading ? 'Registrierung...' : 'Registrieren'}
          </button>
        </form>
      )}

      <div className="text-center text-xs text-white/60">
        Bereits registriert? <Link href="/login" className="text-white hover:underline">Zum Login</Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen text-white relative overflow-x-hidden">
      <div className="relative min-h-screen flex flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <Suspense fallback={<div className="w-full max-w-sm h-[420px] rounded-2xl bg-white/5 backdrop-blur-xl shadow-2xl" />}>
            <RegisterCard />
          </Suspense>
        </div>
        <AppFooter variant="auth" />
      </div>

      <div className="fixed left-4 bottom-[calc(2.25rem+env(safe-area-inset-bottom,0px)+8rem)] sm:bottom-[calc(2.25rem+env(safe-area-inset-bottom,0px)+12rem)] z-20 pointer-events-none select-none">
        <TokenUsageTicker variant="compact" className="w-[320px] max-w-[calc(100vw-2rem)]" />
      </div>
    </div>
  );
}
