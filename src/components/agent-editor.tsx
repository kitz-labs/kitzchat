'use client';

import React from 'react';
import { Save, Bot } from 'lucide-react';

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
  customerVisible: boolean;
  systemPrompt: string;
  inputFormat: string;
  outputFormat: string;
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
          </div>
        </div>
      </div>
    </div>
  );
}
