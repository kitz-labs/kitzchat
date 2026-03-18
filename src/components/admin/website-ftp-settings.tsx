'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Save, Trash2, CheckCircle2, AlertTriangle, PlugZap } from 'lucide-react';

type FtpStatus = {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  root_dir: string | null;
  has_password: boolean;
};

type FtpPayload = {
  status: FtpStatus;
  verify?: { ok: boolean; banner?: string; error?: string } | null;
  error?: string;
};

export function WebsiteFtpSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [payload, setPayload] = useState<FtpPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    host: '',
    port: 21,
    user: '',
    password: '',
    root_dir: '',
  });

  async function load(verify = false) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/website/ftp${verify ? '?verify=1' : ''}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as FtpPayload;
      if (!res.ok) throw new Error(String((data as any)?.error || 'FTP Settings konnten nicht geladen werden'));
      setPayload(data);
      const st = data?.status;
      if (st) {
        setDraft((current) => ({
          ...current,
          host: st.host || '',
          port: st.port || 21,
          user: st.user || '',
          root_dir: st.root_dir || '',
          password: '',
        }));
      }
    } catch (e) {
      setPayload(null);
      setMessage((e as Error).message || 'FTP Settings konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/website/ftp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: draft.host,
          port: draft.port,
          user: draft.user,
          password: draft.password,
          root_dir: draft.root_dir,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as FtpPayload;
      if (!res.ok) throw new Error(String((data as any)?.error || 'Speichern fehlgeschlagen'));
      setMessage('FTP Einstellungen gespeichert.');
      await load(false);
    } catch (e) {
      setMessage((e as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/website/ftp', { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(String(data?.error || 'Loeschen fehlgeschlagen'));
      setMessage('FTP Einstellungen geloescht.');
      await load(false);
    } catch (e) {
      setMessage((e as Error).message || 'Loeschen fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setVerifying(true);
    setMessage(null);
    try {
      await load(true);
      setMessage('Verbindungstest ausgefuehrt.');
    } finally {
      setVerifying(false);
    }
  }

  const status = payload?.status;
  const verifyResult = payload?.verify;

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">FTP (www.aikitz.at)</div>
          <div className="text-xs text-muted-foreground">
            Speichert die FTP-Zugangsdaten im App-State. Passwort wird nur gesetzt, nie im Klartext zurueckgegeben.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => load(false)} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => verify()} disabled={loading || verifying}>
            <PlugZap size={14} /> {verifying ? 'Teste…' : 'Test'}
          </button>
        </div>
      </div>
      <div className="panel-body space-y-3">
        <div className="flex items-center gap-2 text-xs">
          {status?.configured ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
              <CheckCircle2 size={14} /> konfiguriert
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">
              <AlertTriangle size={14} /> unvollstaendig
            </span>
          )}
          {verifyResult ? (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
              verifyResult.ok ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'
            }`}>
              {verifyResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {verifyResult.ok ? `TCP ok${verifyResult.banner ? `: ${verifyResult.banner}` : ''}` : `Test fehlgeschlagen: ${verifyResult.error || 'unknown'}`}
            </span>
          ) : null}
        </div>

        {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">Host</div>
            <input
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none"
              value={draft.host}
              onChange={(e) => setDraft((c) => ({ ...c, host: e.target.value }))}
              placeholder="ftp.world4you.com"
            />
          </label>
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">Port</div>
            <input
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none"
              value={String(draft.port)}
              onChange={(e) => setDraft((c) => ({ ...c, port: Number(e.target.value || 21) }))}
              placeholder="21"
            />
          </label>
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">User</div>
            <input
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none"
              value={draft.user}
              onChange={(e) => setDraft((c) => ({ ...c, user: e.target.value }))}
              placeholder="ftp9742357"
            />
          </label>
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">Passwort</div>
            <input
              type="password"
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none"
              value={draft.password}
              onChange={(e) => setDraft((c) => ({ ...c, password: e.target.value }))}
              placeholder={status?.has_password ? '•••••••• (gesetzt)' : 'setzen…'}
            />
            <div className="text-[11px] text-muted-foreground">Leer lassen, um das bestehende Passwort beizubehalten. Leere Eingabe + Speichern loescht es.</div>
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-muted-foreground">Root-Verzeichnis (optional)</div>
            <input
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none"
              value={draft.root_dir}
              onChange={(e) => setDraft((c) => ({ ...c, root_dir: e.target.value }))}
              placeholder="/"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving || loading}>
            <Save size={14} /> {saving ? 'Speichere…' : 'Speichern'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => clear()} disabled={saving || loading}>
            <Trash2 size={14} /> Loeschen
          </button>
        </div>
      </div>
    </div>
  );
}

