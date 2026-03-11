'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, LogOut, Save, SendHorizontal, ShieldCheck } from 'lucide-react';
import { PaymentCTA } from './payment-cta';
import { useCustomerBillingSync } from '@/hooks/use-customer-billing-sync';

type MeUser = {
  id: number;
  username: string;
  email?: string | null;
  role: 'admin' | 'editor' | 'viewer';
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  plan_amount_cents?: number;
  wallet_balance_cents?: number;
  onboarding_completed_at?: string | null;
  next_topup_discount_percent?: number;
};

type SupportMessage = {
  id: number;
  sender: 'customer' | 'support';
  message: string;
  created_at: string;
};

type AgentItem = {
  id: string;
  name: string;
  customerVisible?: boolean;
};

type Preferences = {
  enabled_agent_ids: string[];
  usage_alert_enabled: boolean;
  usage_alert_daily_tokens: number;
  memory_storage_mode: 'state' | 'custom';
  memory_storage_path: string;
  docu_provider: string;
  docu_root_path: string;
  docu_account_email: string;
  docu_app_password: string;
  docu_api_key: string;
  docu_access_token: string;
  docu_connected: boolean;
  mail_provider: string;
  mail_display_name: string;
  mail_address: string;
  mail_password: string;
  mail_imap_host: string;
  mail_imap_port: number;
  mail_smtp_host: string;
  mail_smtp_port: number;
  mail_pop3_host: string;
  mail_pop3_port: number;
  mail_use_ssl: boolean;
  mail_connected: boolean;
  instagram_username: string;
  instagram_password: string;
  instagram_graph_api: string;
  instagram_user_access_token: string;
  instagram_user_id: string;
  facebook_page_id: string;
  instagram_connected: boolean;
};

const EMPTY_PREFERENCES: Preferences = {
  enabled_agent_ids: [],
  usage_alert_enabled: false,
  usage_alert_daily_tokens: 50000,
  memory_storage_mode: 'state',
  memory_storage_path: '',
  docu_provider: 'lokal',
  docu_root_path: '',
  docu_account_email: '',
  docu_app_password: '',
  docu_api_key: '',
  docu_access_token: '',
  docu_connected: false,
  mail_provider: 'gmail',
  mail_display_name: '',
  mail_address: '',
  mail_password: '',
  mail_imap_host: '',
  mail_imap_port: 993,
  mail_smtp_host: '',
  mail_smtp_port: 465,
  mail_pop3_host: '',
  mail_pop3_port: 995,
  mail_use_ssl: true,
  mail_connected: false,
  instagram_username: '',
  instagram_password: '',
  instagram_graph_api: '',
  instagram_user_access_token: '',
  instagram_user_id: '',
  facebook_page_id: '',
  instagram_connected: false,
};

export function CustomerSettings() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportDraft, setSupportDraft] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    const payload = await res.json();
    setMe(payload?.user || null);
    setEmailDraft(payload?.user?.email || '');
  }, []);

  const loadPreferences = useCallback(async () => {
    const payload = await fetch('/api/customer/preferences', { cache: 'no-store' }).then((response) => response.json());
    setPreferences(payload?.preferences || EMPTY_PREFERENCES);
  }, []);

  const loadSupport = useCallback(async () => {
    const payload = await fetch('/api/customer/support', { cache: 'no-store' }).then((response) => response.json());
    setSupportMessages(Array.isArray(payload?.messages) ? payload.messages : []);
  }, []);

  useEffect(() => {
    loadMe().catch(() => setMe(null));
    loadPreferences().catch(() => setPreferences(EMPTY_PREFERENCES));
    loadSupport().catch(() => setSupportMessages([]));
    fetch('/api/agents?real=true', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setAgents(Array.isArray(payload) ? payload.filter((agent: AgentItem) => agent.customerVisible !== false) : []))
      .catch(() => setAgents([]));
  }, [loadMe, loadPreferences, loadSupport]);

  useCustomerBillingSync({
    onConfirmed: async () => {
      setConfirming(true);
      await loadMe();
      setConfirming(false);
    },
  });

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== 'kitzchat-payment-complete') return;
      setConfirming(true);
      loadMe()
        .catch(() => setMe(null))
        .finally(() => setConfirming(false));
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadMe]);

  const paymentLabel = useMemo(() => {
    if (me?.payment_status === 'paid') return 'Bezahlt';
    if (me?.payment_status === 'pending') return 'Zahlung ausstehend';
    return 'Nicht erforderlich';
  }, [me?.payment_status]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  async function saveAccount() {
    setAccountSaving(true);
    setAccountError(null);
    try {
      const res = await fetch('/api/customer/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailDraft,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Konto konnte nicht gespeichert werden'));
      }
      setCurrentPassword('');
      setNewPassword('');
      await loadMe();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Konto konnte nicht gespeichert werden');
    } finally {
      setAccountSaving(false);
    }
  }

  async function savePreferences() {
    setPreferencesSaving(true);
    try {
      const res = await fetch('/api/customer/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Einstellungen konnten nicht gespeichert werden'));
      }
      setPreferences(data?.preferences || preferences);
    } finally {
      setPreferencesSaving(false);
    }
  }

  async function sendSupportMessage() {
    const message = supportDraft.trim();
    if (!message || supportSending) return;
    setSupportSending(true);
    try {
      const response = await fetch('/api/customer/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const payload = await response.json();
      if (response.ok) {
        setSupportMessages(Array.isArray(payload?.messages) ? payload.messages : []);
        setSupportDraft('');
      }
    } finally {
      setSupportSending(false);
    }
  }

  function toggleAgent(agentId: string) {
    setPreferences((current) => {
      const enabled = current.enabled_agent_ids.includes(agentId)
        ? current.enabled_agent_ids.filter((id) => id !== agentId)
        : [...current.enabled_agent_ids, agentId];
      return { ...current, enabled_agent_ids: enabled };
    });
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Einstellungen</h1>
        <p className="text-xs text-muted-foreground">Verwalte hier Konto, Agenten, Alerts, Integrationen und Support.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="text-sm font-medium">Konto</h2>
          </div>
          <div className="panel-body space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <AccountField label="Benutzername" value={me?.username || '—'} readOnly />
              <AccountField label="Kontotyp" value="Kunde" readOnly />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">E-Mail-Adresse</div>
                <input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
              </label>
              <AccountField label="Agentenzugang" value={me?.has_agent_access ? 'Aktiv' : 'Gesperrt'} readOnly />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Aktuelles Passwort</div>
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1.5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Neues Passwort</div>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
              </label>
            </div>
            {accountError ? <div className="text-sm text-destructive">{accountError}</div> : null}
            <button type="button" onClick={saveAccount} disabled={accountSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
              <Save size={14} /> {accountSaving ? 'Wird gespeichert...' : 'Konto speichern'}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header flex items-center justify-between">
            <h2 className="text-sm font-medium">Abrechnung</h2>
            {me?.has_agent_access ? <ShieldCheck size={16} className="text-success" /> : <CreditCard size={16} className="text-warning" />}
          </div>
          <div className="panel-body space-y-4">
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
              <DetailRow label="Status" value={confirming ? 'Zahlung wird geprueft...' : paymentLabel} />
              <DetailRow label="Guthaben" value={`€${((me?.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
              <DetailRow label="Onboarding" value={me?.onboarding_completed_at ? 'Abgeschlossen' : 'Offen'} />
              <DetailRow label="Naechster Rabatt" value={me?.next_topup_discount_percent ? `${me.next_topup_discount_percent}%` : 'Kein aktiver Rabatt'} />
            </div>

            {!me?.has_agent_access ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Fuehre die erste Zahlung aus, um alle Agenten freizuschalten und den 30 %-Folgerabatt zu aktivieren.</p>
                <PaymentCTA label="€20 mit Stripe bezahlen" returnPath="/settings" />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Dein Zugang ist aktiv. Weitere Einzahlungen startest du jederzeit direkt auf der Seite Guthaben.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Agenten aktivieren oder deaktivieren</h2>
              <p className="text-xs text-muted-foreground">Diese Auswahl ist mit deiner Agenten-Seite und dem Webchat synchron.</p>
            </div>
          </div>
          <div className="panel-body space-y-3">
            {agents.map((agent) => {
              const enabled = preferences.enabled_agent_ids.includes(agent.id);
              return (
                <button key={agent.id} type="button" onClick={() => toggleAgent(agent.id)} className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-left">
                  <div>
                    <div className="text-sm font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{enabled ? 'Im Kundenbereich aktiv' : 'Derzeit deaktiviert'}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {enabled ? 'Aktiv' : 'Aus'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Alerts und Tageslimit</h2>
              <p className="text-xs text-muted-foreground">Lege fest, ab wann du bei hoher taeglicher Token-Nutzung gewarnt werden moechtest.</p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <label className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">Usage Alert</div>
                <div className="text-xs text-muted-foreground">Benachrichtigt dich, wenn deine taegliche Nutzung das Limit erreicht.</div>
              </div>
              <input type="checkbox" checked={preferences.usage_alert_enabled} onChange={(event) => setPreferences((current) => ({ ...current, usage_alert_enabled: event.target.checked }))} />
            </label>

            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">Taegliches Token-Limit</span>
                <span>{preferences.usage_alert_daily_tokens.toLocaleString()} Tokens</span>
              </div>
              <input
                type="range"
                min={1000}
                max={250000}
                step={1000}
                value={preferences.usage_alert_daily_tokens}
                onChange={(event) => setPreferences((current) => ({ ...current, usage_alert_daily_tokens: Number(event.target.value) }))}
                className="mt-4 w-full"
              />
            </div>

            <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
              <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'Agenten, Alerts und Limits speichern'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Memory-Speicher pro Kunde</h2>
              <p className="text-xs text-muted-foreground">Lege fest, ob deine Memory im App-State oder an einem eigenen Speicherort abgelegt werden soll.</p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Speichermodus</div>
              <select value={preferences.memory_storage_mode} onChange={(event) => setPreferences((current) => ({ ...current, memory_storage_mode: event.target.value as 'state' | 'custom' }))} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                <option value="state">Im KitzChat-State speichern</option>
                <option value="custom">Eigenen Speicherort verwenden</option>
              </select>
            </label>
            <PrefInput label="Memory-Pfad" value={preferences.memory_storage_path} onChange={(value) => setPreferences((current) => ({ ...current, memory_storage_path: value }))} />
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              {preferences.memory_storage_mode === 'custom'
                ? 'Neue Chat- und Agentenbeitraege werden in den angegebenen Kundenpfad gespiegelt.'
                : 'Neue Chat- und Agentenbeitraege werden im lokalen KitzChat-State unter customer-memory abgelegt.'}
            </div>
            <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
              <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'Memory-Speicher speichern'}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">DocuAgent: Dokumente und Cloud-Ziele</h2>
              <p className="text-xs text-muted-foreground">Verbinde lokale Ablage, Dropbox, Google Drive oder ownCloud fuer Dokumentanalyse und Sortierung.</p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <div className={`rounded-2xl border px-4 py-3 text-sm ${preferences.docu_connected ? 'border-success/40 bg-success/5 text-success' : 'border-warning/40 bg-warning/5 text-warning'}`}>
              {preferences.docu_connected ? 'DocuAgent ist konfiguriert und kann Dokumente mit deinem Zielpfad nutzen.' : 'Es fehlt noch ein gueltiges Ziel fuer den DocuAgent.'}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Anbieter</div>
                <select value={preferences.docu_provider} onChange={(event) => setPreferences((current) => ({ ...current, docu_provider: event.target.value }))} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                  <option value="lokal">Lokaler Speicher</option>
                  <option value="dropbox">Dropbox</option>
                  <option value="google-drive">Google Drive</option>
                  <option value="owncloud">ownCloud</option>
                </select>
              </label>
              <PrefInput label="Wurzelpfad / Cloud-Ordner" value={preferences.docu_root_path} onChange={(value) => setPreferences((current) => ({ ...current, docu_root_path: value }))} />
              <PrefInput label="Kontakt / Login-Mail" value={preferences.docu_account_email} onChange={(value) => setPreferences((current) => ({ ...current, docu_account_email: value }))} />
              <PrefInput label="App-Passwort" type="password" value={preferences.docu_app_password} onChange={(value) => setPreferences((current) => ({ ...current, docu_app_password: value }))} />
              <PrefInput label="API-Key" type="password" value={preferences.docu_api_key} onChange={(value) => setPreferences((current) => ({ ...current, docu_api_key: value }))} />
              <PrefInput label="Access-Token" type="password" value={preferences.docu_access_token} onChange={(value) => setPreferences((current) => ({ ...current, docu_access_token: value }))} />
            </div>
            <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
              <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'DocuAgent speichern'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">MailAgent: Postfach verbinden</h2>
            <p className="text-xs text-muted-foreground">Verbinde Gmail oder ein eigenes SMTP-/IMAP-/POP3-Postfach fuer Triage, Antworten und Mail-Workflows.</p>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className={`rounded-2xl border px-4 py-3 text-sm ${preferences.mail_connected ? 'border-success/40 bg-success/5 text-success' : 'border-warning/40 bg-warning/5 text-warning'}`}>
            {preferences.mail_connected ? 'MailAgent ist verbunden und kann mit deinem Postfach arbeiten.' : 'Es fehlen noch Mail-Zugangsdaten oder Serverangaben fuer den MailAgent.'}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Provider</div>
              <select value={preferences.mail_provider} onChange={(event) => setPreferences((current) => ({ ...current, mail_provider: event.target.value }))} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook</option>
                <option value="smtp-imap">SMTP / IMAP</option>
                <option value="custom">Eigener Mailserver</option>
              </select>
            </label>
            <PrefInput label="Anzeigename" value={preferences.mail_display_name} onChange={(value) => setPreferences((current) => ({ ...current, mail_display_name: value }))} />
            <PrefInput label="E-Mail-Adresse" value={preferences.mail_address} onChange={(value) => setPreferences((current) => ({ ...current, mail_address: value }))} />
            <PrefInput label="Passwort / App-Passwort" type="password" value={preferences.mail_password} onChange={(value) => setPreferences((current) => ({ ...current, mail_password: value }))} />
            <PrefInput label="IMAP-Host" value={preferences.mail_imap_host} onChange={(value) => setPreferences((current) => ({ ...current, mail_imap_host: value }))} />
            <PrefNumberInput label="IMAP-Port" value={preferences.mail_imap_port} onChange={(value) => setPreferences((current) => ({ ...current, mail_imap_port: value }))} />
            <PrefInput label="SMTP-Host" value={preferences.mail_smtp_host} onChange={(value) => setPreferences((current) => ({ ...current, mail_smtp_host: value }))} />
            <PrefNumberInput label="SMTP-Port" value={preferences.mail_smtp_port} onChange={(value) => setPreferences((current) => ({ ...current, mail_smtp_port: value }))} />
            <PrefInput label="POP3-Host" value={preferences.mail_pop3_host} onChange={(value) => setPreferences((current) => ({ ...current, mail_pop3_host: value }))} />
            <PrefNumberInput label="POP3-Port" value={preferences.mail_pop3_port} onChange={(value) => setPreferences((current) => ({ ...current, mail_pop3_port: value }))} />
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">SSL / TLS aktivieren</div>
              <div className="text-xs text-muted-foreground">Fuer sichere Verbindungen bei IMAP, SMTP und POP3.</div>
            </div>
            <input type="checkbox" checked={preferences.mail_use_ssl} onChange={(event) => setPreferences((current) => ({ ...current, mail_use_ssl: event.target.checked }))} />
          </label>
          <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
            <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'MailAgent speichern'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">Instagram-Verbindung fuer den Insta Agent</h2>
            <p className="text-xs text-muted-foreground">Der Insta Agent wird erst freigeschaltet, wenn alle Felder ausgefuellt und gespeichert wurden.</p>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className={`rounded-2xl border px-4 py-3 text-sm ${preferences.instagram_connected ? 'border-success/40 bg-success/5 text-success' : 'border-warning/40 bg-warning/5 text-warning'}`}>
            {preferences.instagram_connected ? 'Instagram-Verbindung gespeichert. Der Insta Agent ist bereit.' : 'Es fehlen noch Zugangsdaten. Der Insta Agent bleibt gesperrt, bis alle Felder gepflegt sind.'}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PrefInput label="Instagramnutzername" value={preferences.instagram_username} onChange={(value) => setPreferences((current) => ({ ...current, instagram_username: value }))} />
            <PrefInput label="Passwort" value={preferences.instagram_password} type="password" onChange={(value) => setPreferences((current) => ({ ...current, instagram_password: value }))} />
            <PrefInput label="Instagram Graph API" value={preferences.instagram_graph_api} onChange={(value) => setPreferences((current) => ({ ...current, instagram_graph_api: value }))} />
            <PrefInput label="User Access Token" value={preferences.instagram_user_access_token} onChange={(value) => setPreferences((current) => ({ ...current, instagram_user_access_token: value }))} />
            <PrefInput label="Instagram User ID" value={preferences.instagram_user_id} onChange={(value) => setPreferences((current) => ({ ...current, instagram_user_id: value }))} />
            <PrefInput label="Facebook Page ID" value={preferences.facebook_page_id} onChange={(value) => setPreferences((current) => ({ ...current, facebook_page_id: value }))} />
          </div>

          <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
            <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'Instagram-Daten speichern'}
          </button>
        </div>
      </div>

      <div id="support" className="panel scroll-mt-24">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">Support-Chat</h2>
            <p className="text-xs text-muted-foreground">Schreibe direkt hier, wenn du Fragen hast oder ein Problem melden moechtest.</p>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="max-h-72 space-y-3 overflow-auto rounded-2xl border border-border/50 bg-muted/10 p-4">
            {supportMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground">Noch keine Nachrichten. Du kannst hier jederzeit eine Support-Anfrage senden.</div>
            ) : supportMessages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${message.sender === 'customer' ? 'bg-primary text-primary-foreground' : 'bg-background border border-border/50'}`}>
                  <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{message.sender === 'customer' ? 'Du' : 'Support'}</div>
                  <div>{message.message}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background p-3">
            <textarea
              value={supportDraft}
              onChange={(event) => setSupportDraft(event.target.value)}
              placeholder="Beschreibe dein Problem oder deine Frage..."
              className="min-h-[74px] flex-1 resize-none bg-transparent text-sm outline-none"
            />
            <button type="button" onClick={sendSupportMessage} disabled={supportSending || !supportDraft.trim()} className="btn btn-primary btn-sm">
              <SendHorizontal size={14} /> {supportSending ? 'Sende...' : 'Senden'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-medium">Abmelden</div>
            <div className="text-xs text-muted-foreground">Beende deine aktuelle Kunden-Sitzung auf diesem Geraet.</div>
          </div>
          <button type="button" onClick={logout} className="btn btn-ghost text-sm flex items-center gap-2">
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountField({ label, value, readOnly = false }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <label className="space-y-1.5 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <input value={value} readOnly={readOnly} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
    </label>
  );
}

function PrefInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="space-y-1.5 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
    </label>
  );
}

function PrefNumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1.5 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <input value={value} type="number" onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}