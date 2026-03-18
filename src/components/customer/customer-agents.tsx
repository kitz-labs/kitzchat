'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { findPublicApisPremiumEntry } from '@/lib/public-apis-premium';
import { getAgentProfileDefinition, profileToFormState } from '@/lib/customer-agent-profile-schema';

type AgentItem = {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  model?: string;
  role?: string;
  inspiredBy?: string;
  sourceRepo?: string;
  apiProviders?: string[];
  inputFormat?: string;
  outputFormat?: string;
  limits?: string[];
  policies?: string[];
  modelUsage?: {
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    temperature?: number;
    maxToolCalls?: number;
    maxOutputTokens?: number;
    maxContextMessages?: number;
    escalationModel?: string;
  };
  skills?: Array<{ id: string; name: string; description: string }>;
  customerVisible?: boolean;
};

type MeUser = {
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  wallet_balance_cents?: number;
};

type Preferences = {
  enabled_agent_ids: string[];
  instagram_connected: boolean;
  docu_connected?: boolean;
  mail_connected?: boolean;
  connected_integrations_count: number;
};

function getBlockedReason(agentId: string | undefined, preferences: Preferences): string | null {
  return null;
}

const EXAMPLES: Record<string, string[]> = {
  main: ['Plane meinen heutigen Workflow.', 'Welcher Agent passt fuer meine Aufgabe am besten?'],
  marketing: ['Erstelle einen Marketing-Fahrplan fuer die Woche.', 'Gib mir drei Positionierungswinkel fuer mein Angebot.'],
  apollo: ['Formuliere eine erste Outreach-Nachricht.', 'Priorisiere meine interessantesten Leads.'],
  athena: ['Analysiere meinen Markt und meine Konkurrenz.', 'Erstelle eine kompakte Recherche fuer meine Nische.'],
  metis: ['Fasse meine wichtigsten KPIs zusammen.', 'Welche Trends erkennst du in meiner Nutzung?'],
  'kb-manager': ['Strukturiere mein Wissen fuer spaetere Wiederverwendung.', 'Welche Informationen sollte ich dauerhaft ablegen?'],
  'browser-operator': ['Pruefe einen Browser-Workflow fuer mich.', 'Fuehre eine Web-Recherche mit klaren Schritten durch.'],
  codepilot: ['Hilf mir bei einem technischen Plan.', 'Wie setze ich eine Funktion sauber um?'],
  'support-concierge': ['Formuliere eine professionelle Support-Antwort.', 'Wie antworte ich auf eine kritische Kundenfrage?'],
  'campaign-studio': ['Baue eine Launch-Kampagne mit Tests.', 'Gib mir eine Kampagnenstruktur fuer 14 Tage.'],
  'insta-agent': ['Fuehre mich Schritt fuer Schritt durch die Instagram-Einrichtung.', 'Pruefe, welche Instagram-Daten mir noch fehlen.'],
  'docu-agent': ['Ordne diese Dokumente in eine saubere Ablagestruktur ein.', 'Welche Dateien gehoeren in Dropbox, Drive oder meine lokale Kundenablage?'],
  'mail-agent': ['Priorisiere mein Postfach nach Wichtigkeit.', 'Entwirf eine professionelle Antwort fuer diese Kundenmail.'],
};

function modelLabel(model: string | undefined): string {
  if (!model) return 'OpenAI Premium Setup';
  if (model.includes('mini')) return 'OpenAI Fast';
  if (model.includes('4.1')) return 'OpenAI Precision';
  return 'OpenAI Premium';
}

export function CustomerAgents() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ enabled_agent_ids: [], instagram_connected: false, connected_integrations_count: 0 });
  const [selectedId, setSelectedId] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setMe(payload?.user || null))
      .catch(() => setMe(null));

    fetch('/api/agents?real=true', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setAgents(Array.isArray(payload) ? payload.filter((agent) => agent.customerVisible !== false) : []))
      .catch(() => setAgents([]));

    fetch('/api/customer/preferences', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setPreferences(payload?.preferences || { enabled_agent_ids: [], instagram_connected: false, connected_integrations_count: 0 }))
      .catch(() => setPreferences({ enabled_agent_ids: [], instagram_connected: false, connected_integrations_count: 0 }));
  }, []);

  const hasAccess = Boolean(me?.has_agent_access);
  const isActivated = me?.payment_status === 'paid' || (me?.wallet_balance_cents ?? 0) > 0;
  const visibleAgents = agents;

  useEffect(() => {
    if (!selectedId && visibleAgents.length > 0) {
      setSelectedId(visibleAgents[0].id);
    }
  }, [selectedId, visibleAgents]);

  const selectedAgent = useMemo(() => visibleAgents.find((agent) => agent.id === selectedId) || visibleAgents[0] || null, [selectedId, visibleAgents]);
  const enabledAgents = new Set(visibleAgents.map((agent) => agent.id));
  const selectedEnabled = selectedAgent ? enabledAgents.has(selectedAgent.id) : false;
  const selectedBlockedReason = getBlockedReason(selectedAgent?.id, preferences);

  useEffect(() => {
    const agentId = selectedAgent?.id;
    if (!agentId) return;
    setProfileLoading(true);
    setProfileError(null);
    fetch(`/api/customer/agent-profiles/${encodeURIComponent(agentId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String((payload as any)?.error || 'Profil konnte nicht geladen werden'));
        return payload as { profile?: Record<string, unknown>; updated_at?: string | null };
      })
      .then((payload) => {
        setProfileForm(profileToFormState(agentId, payload?.profile || {}));
        setProfileUpdatedAt(payload?.updated_at ?? null);
      })
      .catch((error) => {
        setProfileError(error instanceof Error ? error.message : 'Profil konnte nicht geladen werden');
        setProfileForm(profileToFormState(agentId, {}));
        setProfileUpdatedAt(null);
      })
      .finally(() => setProfileLoading(false));
  }, [selectedAgent?.id]);

  async function saveProfile() {
    const agentId = selectedAgent?.id;
    if (!agentId || profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const response = await fetch(`/api/customer/agent-profiles/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: profileForm }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((payload as any)?.error || 'Profil konnte nicht gespeichert werden'));
      setProfileForm(profileToFormState(agentId, (payload as any)?.profile || {}));
      setProfileUpdatedAt((payload as any)?.updated_at ?? null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Profil konnte nicht gespeichert werden');
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Agenten</h1>
          <p className="text-xs text-muted-foreground">Links siehst du deine Agentenliste. Rechts oeffnen sich Details, Nutzen, Beispiele und deine Personalisierung.</p>
        </div>
        {isActivated ? (
          <div className="badge border bg-success/10 text-success"><ShieldCheck size={12} /> Aktiv</div>
        ) : (
          <div className="badge border bg-warning/10 text-warning"><Lock size={12} /> Noch nicht aktiviert</div>
        )}
      </div>

      {!isActivated ? (
        <div className="panel">
          <div className="panel-body flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">Aktivierung ist ein separater Schritt</div>
              <div className="text-xs text-muted-foreground">Dein Onboarding kann schon abgeschlossen sein. Wenn du alle Agenten freischalten willst, waehle auf der Guthaben-Seite 10, 20, 50, 100 Euro oder einen freien Betrag. Danach wird der Rabatt fuer die naechste Einzahlung vorbereitet.</div>
            </div>
            <a href="/usage-token" className="btn btn-primary text-sm">Aktivierung oeffnen</a>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="panel">
          <div className="panel-body space-y-2">
            {visibleAgents.map((agent) => {
              const active = agent.id === selectedAgent?.id;
              const enabled = enabledAgents.has(agent.id);
              const blockedReason = getBlockedReason(agent.id, preferences);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedId(agent.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/10 hover:border-primary/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{agent.name}</span>
                    <span className={`text-[11px] ${enabled && !blockedReason ? 'text-success' : 'text-muted-foreground'}`}>
                      {blockedReason ? blockedReason : enabled ? 'Aktiv' : 'Deaktiviert'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel">
          {!selectedAgent ? (
            <div className="panel-body text-sm text-muted-foreground">Kein Agent ausgewaehlt.</div>
          ) : (
            <div className="panel-body space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">{selectedAgent.emoji || '🤖'}</div>
                  <div>
                    <div className="text-xl font-semibold">{selectedAgent.name}</div>
                    <div className="text-sm text-muted-foreground">{selectedAgent.role || 'Spezialist'} · {modelLabel(selectedAgent.model)}</div>
                  </div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${selectedEnabled && !selectedBlockedReason ? 'bg-success/15 text-success' : 'bg-warning/10 text-warning'}`}>
                  {selectedBlockedReason ? selectedBlockedReason : selectedEnabled ? 'Aktiviert' : 'Deaktiviert'}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Nutzen" content={selectedAgent.description || 'Keine Beschreibung vorhanden.'} />
                <InfoBlock title="Verwendungen" content={(selectedAgent.skills || []).length > 0 ? (selectedAgent.skills || []).map((skill) => skill.name).join(', ') : 'Individuelle Aufgaben im Kundenbereich, abgestimmt auf den jeweiligen Agenten.'} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Beispiele" content={(EXAMPLES[selectedAgent.id] || ['Beschreibe mir, wie dieser Agent helfen kann.']).join('\n• ')} bullet />
                <InfoBlock
                  title="Datenquellen"
                  content={
                    (selectedAgent.apiProviders || []).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(selectedAgent.apiProviders || []).map((provider) => {
                          const meta = findPublicApisPremiumEntry(provider);
                          const label = (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-medium">{provider}</span>
                              {meta?.auth && meta.auth !== 'No' ? (
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{meta.auth}</span>
                              ) : null}
                            </span>
                          );

                          if (!meta?.url) {
                            return (
                              <span key={provider} className="rounded-full border border-border/60 bg-muted/10 px-3 py-1 text-xs">
                                {label}
                              </span>
                            );
                          }

                          return (
                            <a
                              key={provider}
                              href={meta.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-border/60 bg-muted/10 px-3 py-1 text-xs hover:bg-muted/20"
                              title={meta.description || provider}
                            >
                              {label}
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      'Keine externen Datenquellen hinterlegt.'
                    )
                  }
                />
              </div>

              <InfoBlock title="Kunden-Integrationen" content={preferences.connected_integrations_count > 0 ? `${preferences.connected_integrations_count} gespeicherte Verbindungen werden fuer passende Agenten automatisch als Kontext beruecksichtigt.` : 'Noch keine zusaetzlichen Integrationen gespeichert.'} />

              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Personalisierung</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{getAgentProfileDefinition(selectedAgent.id).title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{getAgentProfileDefinition(selectedAgent.id).description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={saveProfile} disabled={profileSaving || profileLoading} className="btn btn-primary btn-sm">
                      {profileSaving ? 'Speichere…' : 'Speichern'}
                    </button>
                  </div>
                </div>

                {profileError ? <div className="text-sm text-destructive">{profileError}</div> : null}
                {profileLoading ? <div className="text-xs text-muted-foreground">Laedt…</div> : null}
                {profileUpdatedAt ? (
                  <div className="text-[11px] text-muted-foreground">Zuletzt gespeichert: {new Date(profileUpdatedAt).toLocaleString('de-DE')}</div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">Noch kein Profil gespeichert.</div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {getAgentProfileDefinition(selectedAgent.id).fields.map((field) => {
                    const value = profileForm[field.key] ?? '';
                    const common = {
                      value,
                      onChange: (event: any) => setProfileForm((current) => ({ ...current, [field.key]: String(event.target.value) })),
                      placeholder: field.placeholder || '',
                    };
                    const controlClass = 'w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none min-h-[104px] resize-y';

                    return (
                      <label key={field.key} className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                        {field.type === 'select' ? (
                          <select
                            value={value}
                            onChange={(event) => setProfileForm((current) => ({ ...current, [field.key]: String(event.target.value) }))}
                            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none"
                          >
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <textarea {...common} rows={4} className={controlClass} />
                        )}
                        {field.help ? <div className="text-[11px] text-muted-foreground">{field.help}</div> : null}
                      </label>
                    );
                  })}
                </div>

                <div className="text-xs text-muted-foreground">
                  Hinweis: Diese Angaben werden bei neuen Chats automatisch als Kontext genutzt. Du kannst sie jederzeit anpassen.
                </div>
              </div>

              {selectedBlockedReason ? (
                <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
                  Dieser Agent wird erst freigeschaltet, wenn du die benoetigte Verbindung in den Einstellungen vollstaendig gespeichert hast.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, content, bullet = false }: { title: string; content: string | ReactNode; bullet?: boolean }) {
  if (typeof content !== 'string') {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="mt-2 text-sm">{content}</div>
      </div>
    );
  }

  const body = bullet ? content.split('\n').filter(Boolean) : [content];
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2 text-sm">
        {body.map((line) => (
          <div key={line}>{bullet ? `• ${line.replace(/^•\s*/, '')}` : line}</div>
        ))}
      </div>
    </div>
  );
}
