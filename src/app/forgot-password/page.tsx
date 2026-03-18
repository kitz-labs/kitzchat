'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/layout/brand-logo';
import { AppFooter } from '@/components/layout/app-footer';
import { TokenUsageTicker } from '@/components/auth/token-usage-board';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      await res.json().catch(() => ({}));
      setDone(true);
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden">
      <div className="relative min-h-screen flex flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm rounded-2xl bg-white/5 backdrop-blur-xl p-8 space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-1"><BrandLogo compact /></div>
              <h1 className="text-xl font-semibold">Passwort vergessen</h1>
              <p className="text-sm text-white/60">Du bekommst einen Link zum Zuruecksetzen per E-Mail.</p>
            </div>

            {done ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/80">
                  Wenn die Adresse existiert, ist ein Reset-Link unterwegs.
                </div>
                <Link href="/login" className="block w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold text-center hover:opacity-90 transition-opacity">
                  Zurueck zum Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-white/90">E-Mail</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-transparent bg-white/5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                    autoFocus
                  />
                </div>
                {error ? <p className="text-sm text-red-200 bg-red-500/10 px-3 py-2 rounded-xl">{error}</p> : null}
                <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Sende Link...' : 'Reset-Link senden'}
                </button>
              </form>
            )}

            <div className="text-center text-xs text-white/60">
              <Link href="/login" className="text-white hover:underline">Zum Login</Link>
            </div>
          </div>
        </div>
        <AppFooter variant="auth" />
      </div>

      <div className="hidden sm:block fixed left-5 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-20 pointer-events-none select-none">
        <TokenUsageTicker />
      </div>
    </div>
  );
}
