'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/layout/brand-logo';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error || 'Registrierung fehlgeschlagen'));
        return;
      }
      window.location.href = '/usage-token?onboarding=1';
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-1"><BrandLogo compact /></div>
          <h1 className="text-xl font-semibold">Erstelle dein KitzChat-Konto</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Registriere dich als Kunde, schliesse dein Onboarding ab und entscheide danach selbst, wann du Guthaben oder Aktivierung nachladen willst.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1.5">Benutzername</label>
            <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">Passwort</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" required />
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Für die lokale Entwicklung reichen 4+ Zeichen.</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm text-[var(--muted-foreground)]">
            Mit der Registrierung kannst du die rechtlichen Informationen jederzeit im Footer unter Nutzungshinweise und Datenschutz einsehen.
          </div>
          {error ? <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">{error}</p> : null}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-50">
            {loading ? 'Konto wird erstellt...' : 'Kundenkonto erstellen'}
          </button>
        </form>

        <div className="text-center text-xs text-[var(--muted-foreground)]">
          Bereits registriert? <Link href="/login" className="text-primary hover:underline">Zum Login</Link>
        </div>
      </div>
    </div>
  );
}