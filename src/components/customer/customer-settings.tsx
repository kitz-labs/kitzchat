'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, LogOut, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { PaymentCTA } from './payment-cta';
import { CustomerSupportPanel } from './customer-support-panel';
import { useCustomerBillingSync } from '@/hooks/use-customer-billing-sync';
import { INTEGRATION_CATALOG, sanitizeIntegrationProfile, type CustomerIntegrationProfile } from '@/lib/integration-catalog';
import type { CustomerPreferences } from '@/lib/customer-preferences';
import { PasskeyManager } from '@/components/auth/passkey-manager';

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

type AgentItem = {
  id: string;
  name: string;
  customerVisible?: boolean;
};

type Preferences = CustomerPreferences;

const EMPTY_PREFERENCES: Preferences = {
  enabled_agent_ids: [],
  usage_alert_enabled: false,
  usage_alert_daily_tokens: 50000,
  secure_storage_enabled: false,
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
  integration_profiles: [],
  connected_integrations_count: 0,
};

export function CustomerSettings() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mailTesting, setMailTesting] = useState(false);
  const [mailTestResult, setMailTestResult] = useState<string | null>(null);
  const [mailTestError, setMailTestError] = useState<string | null>(null);

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

  useEffect(() => {
    loadMe().catch(() => setMe(null));
    loadPreferences().catch(() => setPreferences(EMPTY_PREFERENCES));
    fetch('/api/agents?real=true', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setAgents(Array.isArray(payload) ? payload.filter((agent: AgentItem) => agent.customerVisible !== false) : []))
      .catch(() => setAgents([]));
  }, [loadMe, loadPreferences]);

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
      const payload = parsePaymentStorageValue(event.newValue);
      if (payload?.redirectTo && payload.redirectTo !== window.location.pathname) {
        window.location.href = payload.redirectTo;
        return;
      }
      setConfirming(true);
      loadMe()
        .catch(() => setMe(null))
        .finally(() => setConfirming(false));
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadMe]);

  function addIntegration(providerId: string) {
    setPreferences((current) => {
      const nextProfile = sanitizeIntegrationProfile(
        {
          id: `integration-${Date.now()}`,
          provider: providerId,
          label: INTEGRATION_CATALOG.find((item) => item.id === providerId)?.name || 'Neue Integration',
        },
        current.integration_profiles.length,
      );
      const nextProfiles = [...current.integration_profiles, nextProfile];
      return {
        ...current,
        integration_profiles: nextProfiles,
        connected_integrations_count: nextProfiles.filter((profile) => profile.connected).length,
      };
    });
  }

  function updateIntegration(id: string, patch: Partial<CustomerIntegrationProfile>) {
    setPreferences((current) => ({
      ...current,
      integration_profiles: current.integration_profiles.map((profile, index) =>
        profile.id === id ? sanitizeIntegrationProfile({ ...profile, ...patch }, index) : profile,
      ),
      connected_integrations_count: current.integration_profiles
        .map((profile, index) => (profile.id === id ? sanitizeIntegrationProfile({ ...profile, ...patch }, index) : profile))
        .filter((profile) => profile.connected).length,
    }));
  }

  function removeIntegration(id: string) {
    setPreferences((current) => ({
      ...current,
      integration_profiles: current.integration_profiles.filter((profile) => profile.id !== id),
      connected_integrations_count: current.integration_profiles.filter((profile) => profile.id !== id && profile.connected).length,
    }));
  }

  function startIntegrationOAuth(profileId: string, providerId: string) {
    const returnTo = `${window.location.pathname}${window.location.search || ''}`;
    window.location.href = `/api/customer/integrations/oauth/start?provider=${encodeURIComponent(providerId)}&profile_id=${encodeURIComponent(profileId)}&return_to=${encodeURIComponent(returnTo)}`;
  }

  const paymentLabel = useMemo(() => {
    if (me?.payment_status === 'paid') return 'Bezahlt';
    if (me?.payment_status === 'pending') return 'Zahlung ausstehend';
    return 'Nicht erforderlich';
  }, [me?.payment_status]);
  const isActivated = me?.payment_status === 'paid' || (me?.wallet_balance_cents ?? 0) > 0;
  const integrationOptions = useMemo(
    () => INTEGRATION_CATALOG.filter((provider) => provider.popular).concat(INTEGRATION_CATALOG.filter((provider) => !provider.popular)),
    [],
  );

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

  async function testMailAgent() {
    setMailTesting(true);
    setMailTestError(null);
    setMailTestResult(null);
    try {
      const response = await fetch('/api/customer/mail/test', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'MailAgent Test fehlgeschlagen'));
      }
      setMailTestResult(payload?.source === 'imap'
        ? `IMAP OK · ${payload?.messages ?? 0} Messages`
        : 'SMTP OK');
    } catch (error) {
      setMailTestError(error instanceof Error ? error.message : 'MailAgent Test fehlgeschlagen');
    } finally {
      setMailTesting(false);
    }
  }

  async function deleteAccount() {
    if (deleting || !deleteConfirm) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/customer/account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Konto konnte nicht geloescht werden'));
      }
      window.location.href = '/login?deleted=1';
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Konto konnte nicht geloescht werden');
    } finally {
      setDeleting(false);
    }
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
              <AccountField label="Agentenzugang" value={me?.has_agent_access ? (isActivated ? 'Aktiviert' : 'Freier Einstieg aktiv') : 'Gesperrt'} readOnly />
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
            {isActivated ? <ShieldCheck size={16} className="text-success" /> : <CreditCard size={16} className="text-warning" />}
          </div>
          <div className="panel-body space-y-4">
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
              <DetailRow label="Status" value={confirming ? 'Zahlung wird geprueft...' : paymentLabel} />
              <DetailRow label="Guthaben" value={`€${((me?.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
              <DetailRow label="Onboarding" value={me?.onboarding_completed_at ? 'Abgeschlossen' : 'Offen'} />
              <DetailRow label="Naechster Rabatt" value={me?.next_topup_discount_percent ? `${me.next_topup_discount_percent}%` : 'Kein aktiver Rabatt'} />
            </div>

            {!isActivated ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Dein Onboarding ist davon getrennt. Wenn du alle Agenten freischalten willst, kannst du die Aktivierung hier oder spaeter auf der Guthaben-Seite starten.</p>
                <PaymentCTA label="Aktivierung mit Stripe starten" returnPath="/" />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Dein Zugang ist aktiv. Weitere Einzahlungen startest du jederzeit direkt auf der Seite Guthaben.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PasskeyManager title="Passkeys (Login ohne Passwort)" />
        <div className="panel">
          <div className="panel-body space-y-2">
            <div className="text-sm font-medium">Support hilft dir</div>
            <div className="text-xs text-muted-foreground">
              Wenn du Passkeys nicht einrichten kannst (Browser, Device, iCloud Keychain, Windows Hello): schreibe uns im Support und wir fuehren dich Schritt fuer Schritt durch.
            </div>
            <a href="/support-chat" className="btn btn-primary btn-sm inline-flex items-center gap-2 w-fit">
              Support oeffnen
            </a>
          </div>
        </div>
      </div>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${preferences.secure_storage_enabled ? 'border-success/40 bg-success/5 text-success' : 'border-warning/40 bg-warning/5 text-warning'}`}>
        {preferences.secure_storage_enabled
          ? 'Sensible Integrationsdaten werden serverseitig verschluesselt gespeichert.'
          : 'Sensible Integrationsdaten koennen noch nicht verschluesselt gespeichert werden. Empfohlen: KITZCHAT_SETTINGS_ENCRYPTION_KEY auf dem Server setzen.'}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Alle Agenten sind aktiviert</h2>
              <p className="text-xs text-muted-foreground">Der komplette Agenten-Katalog steht im Kundenbereich bereit. Verbindungen wie Mail, Dokumente oder Instagram schalten zusaetzliche Spezialfunktionen frei.</p>
            </div>
          </div>
          <div className="panel-body space-y-3">
            {agents.map((agent) => {
              const enabled = true;
              return (
                <div key={agent.id} className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-left">
                  <div>
                    <div className="text-sm font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">Im Kundenbereich aktiv</div>
                  </div>
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                    Aktiv
                  </span>
                </div>
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
              <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'Alerts und Limits speichern'}
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
                <option value="state">Nexora State (automatisch)</option>
                <option value="custom">Eigenen Speicherort verwenden</option>
              </select>
            </label>
            <PrefInput label="Memory-Pfad" value={preferences.memory_storage_path} onChange={(value) => setPreferences((current) => ({ ...current, memory_storage_path: value }))} />
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              {preferences.memory_storage_mode === 'custom'
                ? 'Neue Chat- und Agentenbeitraege werden in den angegebenen Kundenpfad gespiegelt.'
                : 'Neue Chat- und Agentenbeitraege werden automatisch im Nexora-State unter customer-memory abgelegt.'}
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

      <div id="integrations" className="panel">
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
          {mailTestResult ? (
            <div className="rounded-2xl border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              MailAgent Test erfolgreich: {mailTestResult}
            </div>
          ) : null}
          {mailTestError ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
              {mailTestError}
            </div>
          ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
              <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'MailAgent speichern'}
            </button>
            <button type="button" onClick={testMailAgent} disabled={mailTesting} className="btn btn-ghost text-sm inline-flex items-center gap-2">
              {mailTesting ? 'Teste...' : 'MailAgent testen'}
            </button>
          </div>
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

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">Eigene APIs und Integrationen</h2>
            <p className="text-xs text-muted-foreground">Fuege haeufig genutzte Services als Dropdown-Auswahl hinzu. Passende Agenten sehen diese Verbindungen danach automatisch als verfuegbaren Arbeitskontext.</p>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            {preferences.integration_profiles.length > 0
              ? `${preferences.integration_profiles.filter((profile) => profile.connected).length} von ${preferences.integration_profiles.length} Integrationen sind einsatzbereit.`
              : 'Noch keine zusaetzlichen Integrationen gespeichert.'}
          </div>

          <label className="space-y-1.5 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Integration hinzufuegen</div>
            <div className="flex gap-2">
              <select
                defaultValue=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  addIntegration(event.target.value);
                  event.target.value = '';
                }}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <option value="">Provider auswaehlen...</option>
                {integrationOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.description}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost text-sm inline-flex items-center gap-2" onClick={() => addIntegration('notion')}>
                <Plus size={14} /> Schnellstart
              </button>
            </div>
          </label>

          <div className="space-y-4">
            {preferences.integration_profiles.map((profile) => {
              const provider = INTEGRATION_CATALOG.find((item) => item.id === profile.provider);
              const oauthSupported = Boolean(provider?.oauthSupported && provider?.oauthProvider);
              const oauthConnected = profile.connectionType === 'oauth' && profile.oauthStatus === 'connected';
              return (
                <div key={profile.id} className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium">{provider?.name || profile.label || 'Integration'}</div>
                      <div className="text-xs text-muted-foreground">{provider?.description || 'Benutzerdefinierte Verbindung'} · {provider?.credentialHint || 'API-Zugang oder Login'}</div>
                      {oauthSupported ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          OAuth verfuegbar{profile.oauthConnectedAt ? ` · verbunden ${new Date(profile.oauthConnectedAt).toLocaleDateString('de-DE')}` : ''}.
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${profile.connected ? 'bg-success/15 text-success' : 'bg-warning/10 text-warning'}`}>
                        {profile.connected ? 'Verbunden' : 'Unvollstaendig'}
                      </span>
                      <button type="button" onClick={() => removeIntegration(profile.id)} className="btn btn-ghost text-sm inline-flex items-center gap-2">
                        <Trash2 size={14} /> Entfernen
                      </button>
                    </div>
                  </div>

                  {oauthSupported ? (
                    <div className="rounded-2xl border border-border/60 bg-background/60 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Verbindungstyp</div>
                          <div className="mt-1 text-sm font-medium">
                            {profile.connectionType === 'oauth' ? 'OAuth Verbindung' : 'Manuelle Zugangsdaten'}
                          </div>
                        </div>
                        <select
                          value={profile.connectionType}
                          onChange={(event) => updateIntegration(profile.id, {
                            connectionType: event.target.value === 'oauth' ? 'oauth' : 'manual',
                            oauthProvider: provider?.oauthProvider || profile.oauthProvider,
                            oauthStatus: event.target.value === 'oauth' && oauthConnected ? 'connected' : profile.oauthStatus,
                          })}
                          className="rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                        >
                          <option value="manual">Manuell</option>
                          <option value="oauth">OAuth</option>
                        </select>
                      </div>

                      {profile.connectionType === 'oauth' ? (
                        <div className="space-y-3">
                          <div className={`rounded-2xl border px-4 py-3 text-sm ${oauthConnected ? 'border-success/40 bg-success/5 text-success' : 'border-warning/40 bg-warning/5 text-warning'}`}>
                            {oauthConnected
                              ? `OAuth ist verbunden${profile.accountIdentifier ? ` mit ${profile.accountIdentifier}` : ''}.`
                              : 'OAuth noch nicht verbunden. Nach dem Connect werden Tokens sicher gespeichert.'}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => startIntegrationOAuth(profile.id, profile.provider)} className="btn btn-primary text-sm">
                              {oauthConnected ? 'OAuth erneuern' : 'Mit OAuth verbinden'}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateIntegration(profile.id, {
                                connectionType: 'manual',
                                oauthStatus: 'disconnected',
                                oauthConnectedAt: '',
                                oauthScopes: [],
                                accessToken: '',
                                refreshToken: '',
                              })}
                              className="btn btn-ghost text-sm"
                            >
                              Auf manuell wechseln
                            </button>
                          </div>
                          {profile.oauthScopes.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {profile.oauthScopes.map((scope) => (
                                <span key={`${profile.id}-${scope}`} className="rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary">
                                  {scope}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <PrefInput label="Label" value={profile.label} onChange={(value) => updateIntegration(profile.id, { label: value })} />
                    <PrefInput label="Konto / Workspace" value={profile.accountIdentifier} onChange={(value) => updateIntegration(profile.id, { accountIdentifier: value })} />
                    <PrefInput label="Basis-URL" value={profile.baseUrl} onChange={(value) => updateIntegration(profile.id, { baseUrl: value })} />
                    {profile.connectionType !== 'oauth' ? (
                      <>
                        <PrefInput label="API-Key" type="password" value={profile.apiKey} onChange={(value) => updateIntegration(profile.id, { apiKey: value })} />
                        <PrefInput label="Access-Token" type="password" value={profile.accessToken} onChange={(value) => updateIntegration(profile.id, { accessToken: value })} />
                        <PrefInput label="Refresh-Token" type="password" value={profile.refreshToken} onChange={(value) => updateIntegration(profile.id, { refreshToken: value })} />
                        <PrefInput label="Benutzername" value={profile.username} onChange={(value) => updateIntegration(profile.id, { username: value })} />
                        <PrefInput label="Passwort / Secret" type="password" value={profile.password} onChange={(value) => updateIntegration(profile.id, { password: value })} />
                      </>
                    ) : (
                      <>
                        <PrefInput label="OAuth Provider" value={profile.oauthProvider} onChange={(value) => updateIntegration(profile.id, { oauthProvider: value })} />
                        <PrefInput label="Account" value={profile.accountIdentifier} onChange={(value) => updateIntegration(profile.id, { accountIdentifier: value })} />
                        <PrefInput label="Access-Token" type="password" value={profile.accessToken} onChange={(value) => updateIntegration(profile.id, { accessToken: value })} />
                        <PrefInput label="Refresh-Token" type="password" value={profile.refreshToken} onChange={(value) => updateIntegration(profile.id, { refreshToken: value })} />
                        <PrefInput label="OAuth Status" value={profile.oauthStatus} onChange={(value) => updateIntegration(profile.id, { oauthStatus: value === 'connected' || value === 'expired' ? value : 'disconnected' })} />
                      </>
                    )}
                    <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Notizen fuer Agenten</div>
                      <textarea value={profile.notes} onChange={(event) => updateIntegration(profile.id, { notes: event.target.value })} className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={savePreferences} disabled={preferencesSaving} className="btn btn-primary text-sm inline-flex items-center gap-2">
            <Save size={14} /> {preferencesSaving ? 'Wird gespeichert...' : 'Integrationen speichern'}
          </button>
        </div>
      </div>

      <div id="support" className="scroll-mt-24">
        <CustomerSupportPanel compact />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">Konto loeschen</h2>
            <p className="text-xs text-muted-foreground">Dein Konto wird dauerhaft entfernt. Verbleibende Credits werden dem Admin gutgeschrieben.</p>
          </div>
        </div>
        <div className="panel-body space-y-3">
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
            Diese Aktion ist endgueltig. Deine Chats und Einstellungen werden geloescht, dein Restguthaben wird intern auf das Admin-Konto uebertragen.
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">Ich verstehe die Folgen</div>
              <div className="text-xs text-muted-foreground">Kein Passwort erforderlich, der Account wird sofort entfernt.</div>
            </div>
            <input type="checkbox" checked={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.checked)} />
          </label>
          {deleteError ? <div className="text-sm text-destructive">{deleteError}</div> : null}
          <button type="button" onClick={deleteAccount} disabled={!deleteConfirm || deleting} className="btn btn-destructive text-sm inline-flex items-center gap-2">
            <Trash2 size={14} /> {deleting ? 'Wird geloescht...' : 'Konto endgueltig loeschen'}
          </button>
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

function parsePaymentStorageValue(value: string | null): { redirectTo?: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { redirectTo?: unknown };
    return typeof parsed.redirectTo === 'string' ? { redirectTo: parsed.redirectTo } : null;
  } catch {
    return null;
  }
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
