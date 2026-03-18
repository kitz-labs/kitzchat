'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Send, ShieldAlert, XCircle } from 'lucide-react';

type TelegramSettingsPayload = {
  ok?: boolean;
  telegram?: {
    enabled: boolean;
    has_bot_token: boolean;
    chat_id: string | null;
    env_configured: boolean;
  };
  error?: string;
};

export default function TelegramPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [envConfigured, setEnvConfigured] = useState(false);
  const [hasBotToken, setHasBotToken] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const configured = useMemo(() => enabled && hasBotToken && Boolean(chatId.trim()), [enabled, hasBotToken, chatId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/telegram/settings', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as TelegramSettingsPayload;
      if (!res.ok) throw new Error(String(data?.error || 'Failed to load telegram settings'));
      const t = data.telegram;
      setEnabled(Boolean(t?.enabled));
      setChatId(t?.chat_id || '');
      setEnvConfigured(Boolean(t?.env_configured));
      setHasBotToken(Boolean(t?.has_bot_token));
    } catch (e) {
      setError((e as Error).message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setWebhookUrl(`${window.location.origin}/api/telegram/bot/webhook`);
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const body: Record<string, unknown> = { enabled, chat_id: chatId.trim() };
      if (botToken.trim()) body.bot_token = botToken.trim();
      const res = await fetch('/api/admin/telegram/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as TelegramSettingsPayload;
      if (!res.ok) throw new Error(String(data?.error || 'Speichern fehlgeschlagen'));
      setBotToken('');
      setOkMsg('Telegram Einstellungen gespeichert.');
      const t = data.telegram;
      setEnabled(Boolean(t?.enabled));
      setChatId(t?.chat_id || '');
      setEnvConfigured(Boolean(t?.env_configured));
      setHasBotToken(Boolean(t?.has_bot_token));
    } catch (e) {
      setError((e as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/admin/telegram/test', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(String(data?.error || 'Telegram Test fehlgeschlagen'));
      setOkMsg('Telegram Test gesendet.');
    } catch (e) {
      setError((e as Error).message || 'Telegram Test fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  }

  async function clearToken() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/admin/telegram/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_bot_token: true }),
      });
      const data = (await res.json().catch(() => ({}))) as TelegramSettingsPayload;
      if (!res.ok) throw new Error(String(data?.error || 'Loeschen fehlgeschlagen'));
      setOkMsg('Bot Token geloescht.');
      setHasBotToken(Boolean(data.telegram?.has_bot_token));
    } catch (e) {
      setError((e as Error).message || 'Loeschen fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function clearChatId() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/admin/telegram/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_chat_id: true }),
      });
      const data = (await res.json().catch(() => ({}))) as TelegramSettingsPayload;
      if (!res.ok) throw new Error(String(data?.error || 'Loeschen fehlgeschlagen'));
      setOkMsg('Chat ID geloescht.');
      setChatId(data.telegram?.chat_id || '');
    } catch (e) {
      setError((e as Error).message || 'Loeschen fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const exportEnvSnippet = [
    'TELEGRAM_BOT_TOKEN=...',
    'TELEGRAM_CHAT_ID=...',
  ].join('\n');

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Telegram</h1>
          <p className="text-sm text-muted-foreground mt-1">Alerts, Tests und Konfiguration fuer Business-Operations.</p>
        </div>
        <button
          onClick={() => load()}
          className="h-9 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          disabled={loading}
        >
          Neu laden
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</div>
          <div className={`mt-1 text-sm font-semibold ${configured ? 'text-success' : 'text-warning'}`}>
            {configured ? 'aktiv' : enabled ? 'nicht konfiguriert' : 'deaktiviert'}
          </div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">ENV gefunden</div>
          <div className={`mt-1 text-sm font-semibold ${envConfigured ? 'text-success' : 'text-muted-foreground'}`}>
            {envConfigured ? 'ja' : 'nein'}
          </div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">API</div>
          <div className="mt-1 text-sm font-semibold text-foreground">/api/admin/telegram/test</div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Bot Webhook</div>
          <div className="mt-1 text-sm font-semibold text-foreground truncate">{webhookUrl ? '/api/telegram/bot/webhook' : '—'}</div>
        </div>
      </div>

      {loading ? (
        <div className="panel p-6 h-40 animate-pulse bg-muted/20" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="panel">
            <div className="panel-header">
              <h2 className="section-title">Konfiguration</h2>
            </div>
            <div className="panel-body space-y-4">
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Bot Commands</div>
                <div className="mt-1 text-xs">
                  Webhook URL: <span className="font-mono">{webhookUrl || '—'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    onClick={() => webhookUrl && navigator.clipboard?.writeText(webhookUrl)}
                    disabled={!webhookUrl}
                  >
                    <Copy size={14} /> Copy Webhook
                  </button>
                  <div className="text-xs text-muted-foreground flex items-center">
                    Setze diesen Link als Telegram <span className="font-mono ml-1">setWebhook</span>.
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Telegram aktiv</div>
                <button
                  onClick={() => setEnabled((v) => !v)}
                  className={`h-9 rounded-md border px-3 text-xs font-semibold transition-colors ${
                    enabled ? 'border-success/40 bg-success/10 text-success' : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  {enabled ? 'Aktiv' : 'Aus'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Chat ID</label>
                <div className="flex gap-2">
                  <input
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="h-10 flex-1 rounded-md border border-border/60 bg-background/60 px-3 text-sm"
                    placeholder="-1001234567890"
                  />
                  <button
                    onClick={() => clearChatId()}
                    className="h-10 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    disabled={saving}
                    title="Chat ID loeschen (Settings)"
                  >
                    Loeschen
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Bot Token</label>
                <div className="flex gap-2">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="h-10 flex-1 rounded-md border border-border/60 bg-background/60 px-3 text-sm"
                    placeholder={hasBotToken ? '•••••••• (gesetzt)' : '123456:ABC-DEF...'}
                  />
                  <button
                    onClick={() => setShowToken((v) => !v)}
                    className="h-10 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    type="button"
                  >
                    {showToken ? 'Verbergen' : 'Anzeigen'}
                  </button>
                  <button
                    onClick={() => clearToken()}
                    className="h-10 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    disabled={saving}
                    title="Token loeschen (Settings)"
                    type="button"
                  >
                    Loeschen
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Token wird nur gespeichert, wenn du ihn hier eintraegst und auf Speichern klickst.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => save()}
                  className="h-10 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                  disabled={saving}
                >
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>
                <button
                  onClick={() => sendTest()}
                  className="h-10 rounded-md border border-border/60 px-4 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                  disabled={testing || saving || !configured}
                  title={!configured ? 'Bitte Token + Chat ID konfigurieren' : 'Sende Test-Message'}
                >
                  <span className="inline-flex items-center gap-2">
                    <Send size={14} />
                    {testing ? 'Sende...' : 'Test senden'}
                  </span>
                </button>
              </div>

              {okMsg ? (
                <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  {okMsg}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                  <XCircle size={14} />
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2 className="section-title">Setup Guide</h2>
            </div>
            <div className="panel-body space-y-3 text-sm">
              <div className="text-muted-foreground">
                Schnellstart (Bot + Chat ID):
                <ol className="mt-2 list-decimal pl-5 space-y-1 text-foreground/90">
                  <li>Bot via @BotFather erstellen, Token kopieren.</li>
                  <li>Bot zu deinem Channel/Gruppe hinzufuegen.</li>
                  <li>Chat ID ermitteln (z.B. via getUpdates / Bot API Tools) und eintragen.</li>
                  <li>Speichern und dann “Test senden”.</li>
                </ol>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ENV (Alternative)</div>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(exportEnvSnippet);
                        setOkMsg('ENV Snippet kopiert.');
                      } catch {
                        setError('Kopieren nicht moeglich.');
                      }
                    }}
                    className="h-8 rounded-md border border-border/60 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    type="button"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Copy size={14} /> Kopieren
                    </span>
                  </button>
                </div>
                <pre className="mt-2 text-xs whitespace-pre-wrap font-mono text-foreground/90">{exportEnvSnippet}</pre>
              </div>

              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5" />
                <div>
                  Tokens gelten als Secret. Gib sie nur im Admin-UI oder im Server-ENV ein.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
