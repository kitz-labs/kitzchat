'use client';

import { useEffect, useState } from 'react';
import { Bot, Save, ShieldCheck, Sparkles } from 'lucide-react';
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
            <p className="text-xs text-muted-foreground">Hier verwaltest du die kuratierte KitzChat-Agentenliste, die zahlende Kunden sehen und nutzen koennen.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => {
          const draft = drafts[agent.id] ?? agent;
          const changed = JSON.stringify(draft) !== JSON.stringify(agent);

          return (
            <div key={agent.id} className="panel card-hover">
              <div className="panel-body space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                      {draft.emoji}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{draft.name}</div>
                      <div className="text-xs text-muted-foreground">{draft.id}</div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={draft.customerVisible}
                      onChange={(event) => updateDraft(agent.id, { customerVisible: event.target.checked })}
                    />
                    Fuer Kunden sichtbar
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft(agent.id, { name: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Rolle">
                    <input
                      value={draft.role}
                      onChange={(event) => updateDraft(agent.id, { role: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Primaeres Modell">
                    <input
                      value={draft.model}
                      onChange={(event) => updateDraft(agent.id, { model: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Inspiriert von">
                    <input
                      value={draft.inspiredBy || ''}
                      onChange={(event) => updateDraft(agent.id, { inspiredBy: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Quell-Repository">
                    <input
                      value={draft.sourceRepo || ''}
                      onChange={(event) => updateDraft(agent.id, { sourceRepo: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Tools">
                    <input
                      value={draft.tools.join(', ')}
                      onChange={(event) => updateDraft(agent.id, { tools: splitCsv(event.target.value) })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>

                <Field label="Beschreibung">
                  <textarea
                    value={draft.description}
                    onChange={(event) => updateDraft(agent.id, { description: event.target.value })}
                    className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Fallback-Modelle">
                    <input
                      value={draft.fallbacks.join(', ')}
                      onChange={(event) => updateDraft(agent.id, { fallbacks: splitCsv(event.target.value) })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="API-Anbieter">
                    <input
                      value={draft.apiProviders.join(', ')}
                      onChange={(event) => updateDraft(agent.id, { apiProviders: splitCsv(event.target.value) })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>

                <Field label="Systemprompt">
                  <textarea
                    value={draft.systemPrompt}
                    onChange={(event) => updateDraft(agent.id, { systemPrompt: event.target.value })}
                    className="min-h-32 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Input-Format">
                    <textarea
                      value={draft.inputFormat}
                      onChange={(event) => updateDraft(agent.id, { inputFormat: event.target.value })}
                      className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Output-Format">
                    <textarea
                      value={draft.outputFormat}
                      onChange={(event) => updateDraft(agent.id, { outputFormat: event.target.value })}
                      className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Limits">
                    <textarea
                      value={draft.limits.join('\n')}
                      onChange={(event) => updateDraft(agent.id, { limits: splitLines(event.target.value) })}
                      className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Policies">
                    <textarea
                      value={draft.policies.join('\n')}
                      onChange={(event) => updateDraft(agent.id, { policies: splitLines(event.target.value) })}
                      className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Modellnutzung</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Reasoning">
                      <select
                        value={draft.modelUsage.reasoningEffort}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, reasoningEffort: event.target.value as AgentCatalogItem['modelUsage']['reasoningEffort'] } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <option value="minimal">minimal</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </Field>
                    <Field label="Temperatur">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={draft.modelUsage.temperature}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, temperature: Number(event.target.value) || 0 } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Max Tool Calls">
                      <input
                        type="number"
                        min="1"
                        value={draft.modelUsage.maxToolCalls}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, maxToolCalls: Number(event.target.value) || 1 } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Max Output Tokens">
                      <input
                        type="number"
                        min="128"
                        value={draft.modelUsage.maxOutputTokens}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, maxOutputTokens: Number(event.target.value) || 128 } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Max Kontext-Messages">
                      <input
                        type="number"
                        min="1"
                        value={draft.modelUsage.maxContextMessages}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, maxContextMessages: Number(event.target.value) || 1 } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Eskalationsmodell">
                      <input
                        value={draft.modelUsage.escalationModel || ''}
                        onChange={(event) => updateDraft(agent.id, { modelUsage: { ...draft.modelUsage, escalationModel: event.target.value } })}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap border-t border-border/60 pt-3">
                  <div className="text-xs text-muted-foreground">
                      Vorlage: {draft.inspiredBy || 'individuell'}{draft.sourceRepo ? ` · ${draft.sourceRepo}` : ''} · {draft.modelUsage.reasoningEffort} reasoning
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(agent.id)}
                        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => saveAgent(agent.id)}
                        disabled={!changed || savingId === agent.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Save size={14} />
                        {savingId === agent.id ? 'Speichert...' : changed ? 'Aenderungen speichern' : 'Gespeichert'}
                      </button>
                    </div>
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

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}