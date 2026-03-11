'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { PaymentCTA } from './payment-cta';

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
  skills?: Array<{ id: string; name: string; description: string }>;
  customerVisible?: boolean;
};

type MeUser = {
  has_agent_access?: boolean;
};

type Preferences = {
  enabled_agent_ids: string[];
  instagram_connected: boolean;
  docu_connected?: boolean;
  mail_connected?: boolean;
};

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

function getBlockedReason(agentId: string | undefined, preferences: Preferences): string | null {
  if (agentId === 'insta-agent' && !preferences.instagram_connected) {
    return 'Instagram-Einrichtung fehlt';
  }
  if (agentId === 'docu-agent' && !preferences.docu_connected) {
    return 'Dokumentenablage fehlt';
  }
  if (agentId === 'mail-agent' && !preferences.mail_connected) {
    return 'Mail-Verbindung fehlt';
  }
  return null;
}

export function CustomerAgents() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ enabled_agent_ids: [], instagram_connected: false });
  const [selectedId, setSelectedId] = useState('');

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
      .then((payload) => setPreferences(payload?.preferences || { enabled_agent_ids: [], instagram_connected: false }))
      .catch(() => setPreferences({ enabled_agent_ids: [], instagram_connected: false }));
  }, []);

  const hasAccess = Boolean(me?.has_agent_access);
  const visibleAgents = agents;

  useEffect(() => {
    if (!selectedId && visibleAgents.length > 0) {
      setSelectedId(visibleAgents[0].id);
    }
  }, [selectedId, visibleAgents]);

  const selectedAgent = useMemo(() => visibleAgents.find((agent) => agent.id === selectedId) || visibleAgents[0] || null, [selectedId, visibleAgents]);
  const enabledAgents = new Set(preferences.enabled_agent_ids);
  const selectedEnabled = selectedAgent ? enabledAgents.has(selectedAgent.id) : false;
  const selectedBlockedReason = getBlockedReason(selectedAgent?.id, preferences);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Agenten</h1>
          <p className="text-xs text-muted-foreground">Links siehst du deine Agentenliste. Rechts oeffnen sich Details, Nutzen, Verwendungen, Beispiele und Modell-Hinweise.</p>
        </div>
        {hasAccess ? (
          <div className="badge border bg-success/10 text-success"><ShieldCheck size={12} /> Aktiv</div>
        ) : (
          <div className="badge border bg-warning/10 text-warning"><Lock size={12} /> Bis zur Zahlung gesperrt</div>
        )}
      </div>

      {!hasAccess ? (
        <div className="panel">
          <div className="panel-body flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">Schliesse deine €20-Aktivierung ab</div>
              <div className="text-xs text-muted-foreground">Nach der ersten erfolgreichen Zahlung werden alle Agenten freigeschaltet und der Rabatt fuer die naechste Einzahlung vorbereitet.</div>
            </div>
            <PaymentCTA label="€20 bezahlen" returnPath="/usage-token" />
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
                  {selectedBlockedReason ? selectedBlockedReason : selectedEnabled ? 'In Einstellungen aktiviert' : 'In Einstellungen deaktiviert'}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Nutzen" content={selectedAgent.description || 'Keine Beschreibung vorhanden.'} />
                <InfoBlock title="Verwendungen" content={(selectedAgent.skills || []).length > 0 ? (selectedAgent.skills || []).map((skill) => skill.name).join(', ') : 'Individuelle Aufgaben im Kundenbereich, abgestimmt auf den jeweiligen Agenten.'} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Beispiele" content={(EXAMPLES[selectedAgent.id] || ['Beschreibe mir, wie dieser Agent helfen kann.']).join('\n• ')} bullet />
                <InfoBlock title="Modelle" content={`Fuer diesen Agenten setzen wir ${modelLabel(selectedAgent.model)} ein, damit du im Kundenbereich die beste OpenAI-Variante fuer Tempo, Qualitaet und Genauigkeit bekommst.`} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Datenquellen" content={(selectedAgent.apiProviders || []).length > 0 ? (selectedAgent.apiProviders || []).join(', ') : 'Keine externen Datenquellen hinterlegt.'} />
                <InfoBlock title="Herkunft" content={`${selectedAgent.inspiredBy || 'Individuell'}${selectedAgent.sourceRepo ? ` · ${selectedAgent.sourceRepo}` : ''}`} />
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

function InfoBlock({ title, content, bullet = false }: { title: string; content: string; bullet?: boolean }) {
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