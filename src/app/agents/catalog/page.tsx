'use client';

import { useEffect, useState } from 'react';
import { Bot, ShieldCheck, Sparkles } from 'lucide-react';
import AgentEditor, { AgentEditorItem } from '@/components/agent-editor';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { toast } from '@/components/ui/toast';

type AgentCatalogItem = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  model: string;
  fallbacks: string[];
  tools: string[];
  apiProviders: string[];
  inspiredBy?: string;
  sourceRepo?: string;
  customerVisible: boolean;
  systemPrompt: string;
  inputFormat: string;
  outputFormat: string;
  limits: string[];
  policies: string[];
  modelUsage: {
    reasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
    temperature: number;
    maxToolCalls: number;
    maxOutputTokens: number;
    maxContextMessages: number;
    escalationModel?: string;
  };
};

type Drafts = Record<string, AgentCatalogItem>;

function cloneAgent(agent: AgentCatalogItem): AgentCatalogItem {
  return {
    ...agent,
    fallbacks: [...agent.fallbacks],
    tools: [...agent.tools],
    apiProviders: [...agent.apiProviders],
    limits: [...agent.limits],
    policies: [...agent.policies],
    modelUsage: { ...agent.modelUsage },
  };
}

export default function AgentCatalogPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [agents, setAgents] = useState<AgentCatalogItem[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const response = await fetch('/api/agents/catalog', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Katalog konnte nicht geladen werden');
        if (!alive) return;

        const nextAgents = Array.isArray(payload?.agents) ? payload.agents : [];
        setAgents(nextAgents);
        setDrafts(
          Object.fromEntries(nextAgents.map((agent: AgentCatalogItem) => [agent.id, cloneAgent(agent)])),
        );
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError((err as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  function updateDraft(id: string, patch: Partial<AgentCatalogItem>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? agents.find((agent) => agent.id === id) ?? ({} as AgentCatalogItem)),
        ...patch,
      },
    }));
  }

  async function saveAgent(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);

    try {
      const response = await fetch('/api/agents/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Agent konnte nicht gespeichert werden');

      const updated = payload?.agent as AgentCatalogItem;
      setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)));
      setDrafts((current) => ({ ...current, [updated.id]: cloneAgent(updated) }));
      toast.success(`${updated.name} gespeichert`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  if (!ready || loading) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="text-sm font-medium">Agentenkatalog nicht verfuegbar</div>
          <div className="mt-1 text-xs text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  const visibleCount = agents.filter((agent) => drafts[agent.id]?.customerVisible ?? agent.customerVisible).length;

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<Bot size={16} />} label="Agenten im Katalog" value={String(agents.length)} />
        <SummaryCard icon={<ShieldCheck size={16} />} label="Fuer Kunden sichtbar" value={String(visibleCount)} />
        <SummaryCard icon={<Sparkles size={16} />} label="Mit Betriebsprofil" value={String(agents.filter((agent) => agent.systemPrompt && agent.inputFormat && agent.outputFormat).length)} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Agentenkatalog</h1>
            <p className="text-xs text-muted-foreground">Hier verwaltest du die kuratierte Nexora-Agentenliste, die zahlende Kunden sehen und nutzen koennen.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => {
          const draft = drafts[agent.id] ?? agent;
          const changed = JSON.stringify(draft) !== JSON.stringify(agent);

          return (
            <div key={agent.id} className="panel card-hover">
              <button
                type="button"
                onClick={() => setEditingId(agent.id)}
                className="w-full text-left"
              >
                <div className="panel-body space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                        {draft.emoji}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{draft.name}</div>
                        <div className="text-xs text-muted-foreground">{draft.role} · {draft.model}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {changed ? (
                        <span className="badge border bg-warning/10 text-warning text-[11px]">Ungespeichert</span>
                      ) : (
                        <span className="badge border bg-muted/20 text-muted-foreground text-[11px]">OK</span>
                      )}
                      <span className="badge border bg-muted/10 text-muted-foreground text-[11px]">{draft.modelUsage.reasoningEffort}</span>
                      <span className="badge border bg-muted/10 text-muted-foreground text-[11px]">{draft.tools.length} Tools</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground line-clamp-3">
                    {draft.description}
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                    <div className="text-[11px] text-muted-foreground">
                      {draft.id}{draft.sourceRepo ? ` · ${draft.sourceRepo}` : ''}{draft.inspiredBy ? ` · ${draft.inspiredBy}` : ''}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Output ≤ {draft.modelUsage.maxOutputTokens} · Tools ≤ {draft.modelUsage.maxToolCalls}
                    </div>
                  </div>
                </div>
              </button>

              <div className="border-t border-border/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={draft.customerVisible}
                    onChange={(event) => updateDraft(agent.id, { customerVisible: event.target.checked })}
                  />
                  Fuer Kunden sichtbar
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(agent.id);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
                  >
                    Oeffnen
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      saveAgent(agent.id);
                    }}
                    disabled={!changed || savingId === agent.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingId === agent.id ? 'Speichert...' : 'Speichern'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingId && drafts[editingId] && (
        <AgentEditor
          agent={drafts[editingId] as unknown as AgentEditorItem}
          saving={savingId === editingId}
          onChange={(patch) => updateDraft(editingId, patch as Partial<AgentCatalogItem>)}
          onClose={() => setEditingId(null)}
          onSave={async () => {
            await saveAgent(editingId);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel">
      <div className="panel-body flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}
