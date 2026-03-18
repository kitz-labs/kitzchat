'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
    payment_status?: 'not_required' | 'pending' | 'paid';
    onboarding_completed_at?: string | null;
    accepted_terms_at?: string | null;
  };
};

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const msg = searchParams.get('error');
    if (msg) setError(msg);
    const verified = searchParams.get('verified');
    if (verified === '1') setSuccess('E-Mail bestaetigt. Du kannst dich jetzt anmelden.');
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data) => {
        setGoogleEnabled(Boolean(data?.google));
        setGithubEnabled(Boolean(data?.github));
      })
      .catch(() => {
        setGoogleEnabled(false);
        setGithubEnabled(false);
      });
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-white/90 mb-1.5">
          Benutzername oder E-Mail
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          autoFocus
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1.5">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          required
        />
        <div className="mt-2 text-right text-xs">
          <Link className="text-white/70 hover:text-white transition-colors" href="/forgot-password">Passwort vergessen?</Link>
        </div>
      </div>

      {success && (
        <p className="text-sm text-emerald-200 bg-emerald-500/10 px-3 py-2 rounded-xl">
          {success}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-200 bg-red-500/10 px-3 py-2 rounded-xl">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Anmeldung läuft...' : 'Anmelden'}
      </button>

      {passkeySupported && (
        <button
          type="button"
          onClick={() => handlePasskeyLogin()}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/15 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <KeyRound size={16} />
          Mit Passkey anmelden
        </button>
      )}

      {githubEnabled && (
        <a
          href={`/api/auth/github/start?from=${encodeURIComponent(searchParams.get('from') || '/')}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/15 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors"
        >
          <Github size={16} />
          Mit GitHub anmelden
        </a>
      )}

      {googleEnabled && (
        <a
          href={`/api/auth/google/start?from=${encodeURIComponent(searchParams.get('from') || '/')}`}
          className="block w-full py-2.5 rounded-xl border border-white/15 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors"
        >
          Mit Google anmelden
        </a>
      )}

      <div className="text-center text-xs text-white/60">
        Noch kein Konto? <Link className="text-white hover:underline" href="/register">Registrieren</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <div className="relative min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm p-8 rounded-2xl bg-white/5 backdrop-blur-xl shadow-2xl">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-3">
                <BrandLogo compact />
              </div>
            </div>

            <Suspense fallback={<div className="h-48" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <AppFooter variant="auth" />
      </div>

      <div className="fixed left-4 bottom-[calc(2.25rem+env(safe-area-inset-bottom,0px)+8rem)] sm:bottom-[calc(2.25rem+env(safe-area-inset-bottom,0px)+12rem)] z-20 pointer-events-none select-none">
        <TokenUsageTicker variant="compact" className="w-[320px] max-w-[calc(100vw-2rem)]" />
      </div>
    </div>
  );
}
