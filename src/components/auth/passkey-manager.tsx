'use client';

import { useEffect, useMemo, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

type PasskeyItem = {
  id: number;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('de-DE');
}

export function PasskeyManager({ title = 'Passkeys' }: { title?: string }) {
  const supported = useMemo(() => typeof window !== 'undefined' && 'PublicKeyCredential' in window, []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/passkey/credentials', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || 'Passkeys konnten nicht geladen werden'));
      setPasskeys(Array.isArray(data?.passkeys) ? data.passkeys : []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supported) return;
    refresh().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function addPasskey() {
    if (!supported) return;
    setBusy('add');
    try {
      const name = (prompt('Name fuer diesen Passkey (optional):') || '').trim();

      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      const optData = await optRes.json().catch(() => ({}));
      if (!optRes.ok) throw new Error(String(optData?.error || 'Passkey-Optionen fehlgeschlagen'));

      const attResp = await startRegistration(optData.options);
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResp, name: name || null }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(String(verifyData?.error || 'Passkey konnte nicht gespeichert werden'));

      toast.success('Passkey hinzugefuegt');
      await refresh();
    } catch (err) {
      const msg = (err as Error).message || 'Passkey fehlgeschlagen';
      // browser abort is common
      toast.error(msg.includes('AbortError') ? 'Abgebrochen' : msg);
    } finally {
      setBusy(null);
    }
  }

  async function removePasskey(id: number) {
    if (!confirm('Diesen Passkey wirklich entfernen?')) return;
    setBusy(`delete:${id}`);
    try {
      const res = await fetch(`/api/auth/passkey/credentials/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || 'Loeschen fehlgeschlagen'));
      toast.success('Passkey entfernt');
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Fingerprint size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-2"
            onClick={() => addPasskey()}
            disabled={!supported || busy !== null}
          >
            <Plus size={14} /> Passkey hinzufuegen
          </button>
        </div>
      </div>

      <div className="panel-body space-y-3">
        {!supported ? (
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            Dieser Browser/Device unterstuetzt keine Passkeys (WebAuthn).
          </div>
        ) : loading ? (
          <div className="h-24 animate-pulse rounded-3xl bg-muted/20" />
        ) : passkeys.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            Noch keine Passkeys registriert. Klicke „Passkey hinzufuegen“.
          </div>
        ) : (
          <div className="space-y-2">
            {passkeys.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name || `Passkey #${p.id}`}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Erstellt: {formatDateTime(p.created_at)} · Zuletzt genutzt: {formatDateTime(p.last_used_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removePasskey(p.id)}
                  disabled={busy !== null}
                >
                  <Trash2 size={14} /> Entfernen
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="text-[11px] text-muted-foreground">
          Tipp: Passkeys sind die sicherste Login-Option (FaceID/TouchID/Windows Hello). Support hilft dir, falls etwas nicht klappt.
        </div>
      </div>
    </div>
  );
}
