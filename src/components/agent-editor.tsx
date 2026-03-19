'use client';

import React from 'react';
import { Save } from 'lucide-react';
import { PUBLIC_APIS_PREMIUM_SOURCE, findPublicApisPremiumEntry, groupPublicApisPremiumByCategory } from '@/lib/public-apis-premium';
import { OPENAI_MODEL_OPTIONS } from '@/lib/openai-models';

type AgentModelUsage = {
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
  temperature: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxContextMessages: number;
  escalationModel?: string;
};

export type AgentEditorItem = {
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
  modelUsage: AgentModelUsage;
};

export default function AgentEditor({
  agent,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  agent: AgentEditorItem;
  onChange: (patch: Partial<AgentEditorItem>) => void;
  onClose: () => void;
  onSave: () => Promise<void> | void;
  saving?: boolean;
}) {
  if (!agent) return null;

  const publicApiGroups = React.useMemo(() => groupPublicApisPremiumByCategory(), []);
  const publicApiCategories = React.useMemo(() => Object.keys(publicApiGroups).sort((a, b) => a.localeCompare(b)), [publicApiGroups]);
  const [providerToAdd, setProviderToAdd] = React.useState('');
  const modelSelectValue = React.useMemo(() => {
    const values = new Set(OPENAI_MODEL_OPTIONS.map((entry) => entry.value));
    return values.has(agent.model) ? agent.model : '__custom__';
  }, [agent.model]);
  const modelGroups = React.useMemo(() => {
    const grouped: Record<string, typeof OPENAI_MODEL_OPTIONS> = {};
    for (const option of OPENAI_MODEL_OPTIONS) {
      const group = option.group || 'Models';
      grouped[group] = grouped[group] ?? [];
      grouped[group].push(option);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, []);

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

  function addApiProvider(name: string): void {
    const normalized = name.trim();
    if (!normalized) return;
    const next = Array.from(new Set([...(agent.apiProviders ?? []), normalized]));
    onChange({ apiProviders: next });
  }

  function removeApiProvider(name: string): void {
    const normalized = name.trim();
    const next = (agent.apiProviders ?? []).filter((entry) => entry !== normalized);
    onChange({ apiProviders: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border bg-background p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">{agent.emoji || '🤖'}</div>
            <div>
              <div className="text-lg font-semibold">{agent.name}</div>
              <div className="text-xs text-muted-foreground">{agent.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground">Abbrechen</button>
            <button
              type="button"
              onClick={() => onSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Name</div>
              <input
                value={agent.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="z.B. ResearchAgent"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Emoji</div>
              <input
                value={agent.emoji}
                onChange={(e) => onChange({ emoji: e.target.value })}
                placeholder="z.B. 🧭"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Rolle</div>
              <input
                value={agent.role}
                onChange={(e) => onChange({ role: e.target.value })}
                placeholder="z.B. Research & Insights"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Primaeres Modell</div>
              <select
                value={modelSelectValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && value !== '__custom__') {
                    onChange({ model: value });
                  }
                }}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              >
                {modelGroups.map(([group, options]) => (
                  <optgroup key={group} label={group}>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
                <option value="__custom__">Benutzerdefiniert…</option>
              </select>
              {modelSelectValue === '__custom__' ? (
                <input
                  value={agent.model}
                  onChange={(e) => onChange({ model: e.target.value })}
                  placeholder="Model-ID (z.B. gpt-4.1)"
                  className="mt-2 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              ) : null}
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <div className="text-xs text-muted-foreground">Beschreibung</div>
            <textarea
              value={agent.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="min-h-20 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Fallback-Modelle (CSV)</div>
              <input
                value={(agent.fallbacks ?? []).join(', ')}
                onChange={(e) => onChange({ fallbacks: splitCsv(e.target.value) })}
                placeholder="z.B. gpt-4.1, gpt-4o-mini"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Tools (CSV)</div>
              <input
                value={(agent.tools ?? []).join(', ')}
                onChange={(e) => onChange({ tools: splitCsv(e.target.value) })}
                placeholder="z.B. webdav, mailer, crm"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">API-Anbieter (CSV)</div>
              <input
                value={(agent.apiProviders ?? []).join(', ')}
                onChange={(e) => onChange({ apiProviders: splitCsv(e.target.value) })}
                placeholder="z.B. Nominatim, APIs.guru, IPinfo"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(agent.apiProviders ?? []).length > 0 ? (
                  (agent.apiProviders ?? []).map((provider) => {
                    const meta = findPublicApisPremiumEntry(provider);
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => removeApiProvider(provider)}
                        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/10 px-3 py-1 text-xs hover:bg-muted/20"
                        title="Klicken zum Entfernen"
                      >
                        <span className="font-medium">{provider}</span>
                        {meta?.auth && meta.auth !== 'No' ? (
                          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{meta.auth}</span>
                        ) : null}
                        <span className="text-muted-foreground">×</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">Tipp: Du kannst Public-APIs aus dem Katalog hinzufuegen.</div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={providerToAdd}
                  onChange={(e) => setProviderToAdd(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <option value="">+ Public API hinzufuegen (Quelle: public-apis, {PUBLIC_APIS_PREMIUM_SOURCE.syncedAt})</option>
                  {publicApiCategories.map((category) => (
                    <optgroup key={category} label={category}>
                      {publicApiGroups[category].map((entry) => (
                        <option key={`${category}:${entry.name}`} value={entry.name}>
                          {entry.name}{entry.auth && entry.auth !== 'No' ? ` · ${entry.auth}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    addApiProvider(providerToAdd);
                    setProviderToAdd('');
                  }}
                  disabled={!providerToAdd}
                  className="whitespace-nowrap rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Hinzufuegen
                </button>
              </div>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Inspiriert von</div>
              <input
                value={agent.inspiredBy || ''}
                onChange={(e) => onChange({ inspiredBy: e.target.value })}
                placeholder="z.B. browser-use"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">Quell-Repository</div>
              <input
                value={agent.sourceRepo || ''}
                onChange={(e) => onChange({ sourceRepo: e.target.value })}
                placeholder="z.B. browser-use/browser-use"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <div className="text-xs text-muted-foreground">Sichtbar fuer Kunden</div>
            <div>
              <input
                type="checkbox"
                checked={Boolean(agent.customerVisible)}
                onChange={(e) => onChange({ customerVisible: e.target.checked })}
              />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-xs text-muted-foreground">Systemprompt</div>
            <textarea
              value={agent.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              className="min-h-24 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Input-Format</div>
              <textarea
                value={agent.inputFormat}
                onChange={(e) => onChange({ inputFormat: e.target.value })}
                className="min-h-20 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Output-Format</div>
              <textarea
                value={agent.outputFormat}
                onChange={(e) => onChange({ outputFormat: e.target.value })}
                className="min-h-20 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Limits (eine Zeile pro Regel)</div>
              <textarea
                value={(agent.limits ?? []).join('\n')}
                onChange={(e) => onChange({ limits: splitLines(e.target.value) })}
                className="min-h-20 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Policies (eine Zeile pro Regel)</div>
              <textarea
                value={(agent.policies ?? []).join('\n')}
                onChange={(e) => onChange({ policies: splitLines(e.target.value) })}
                className="min-h-20 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Modellnutzung</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Reasoning</div>
                <select
                  value={agent.modelUsage.reasoningEffort}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, reasoningEffort: e.target.value as any } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <option value="minimal">minimal</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Temperatur</div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={String(agent.modelUsage.temperature ?? 0.2)}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, temperature: Number(e.target.value) || 0 } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Max Token</div>
                <input
                  type="number"
                  min="128"
                  value={String(agent.modelUsage.maxOutputTokens ?? 1400)}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, maxOutputTokens: Number(e.target.value) || 128 } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Max Tool Calls</div>
                <input
                  type="number"
                  min="1"
                  value={String(agent.modelUsage.maxToolCalls ?? 3)}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, maxToolCalls: Number(e.target.value) || 1 } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Max Kontext-Messages</div>
                <input
                  type="number"
                  min="1"
                  value={String(agent.modelUsage.maxContextMessages ?? 14)}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, maxContextMessages: Number(e.target.value) || 1 } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Eskalationsmodell</div>
                <input
                  value={agent.modelUsage.escalationModel || ''}
                  onChange={(e) => onChange({ modelUsage: { ...agent.modelUsage, escalationModel: e.target.value } })}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
