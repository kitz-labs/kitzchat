'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Contact, Search, ChevronRight, ChevronLeft, Mail, Linkedin, Star,
  Clock, Building2, User, ArrowUpDown, X, Pause, Play,
  Send, Eye, CircleDot, MessageSquare, CalendarCheck, CheckCircle, Ban,
  ChevronDown, ChevronUp, Check, XCircle, Edit3, Save, Loader2,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useDashboard } from '@/store';
import { timeAgo } from '@/lib/utils';
import type { Lead, Sequence, FunnelStep } from '@/types';

interface CrmData {
  leads: Lead[];
  funnel: FunnelStep[];
  summary: { total: number; avg_score: number; tier_breakdown: { tier: string; c: number }[] };
}

interface LeadDetail {
  lead: Lead & { pause_outreach?: number };
  sequences: Sequence[];
  timeline: { id: number; type: string; description: string; timestamp: string }[];
}

const STAGES = ['new', 'validated', 'contacted', 'replied', 'interested', 'booked', 'qualified'] as const;

const STAGE_ICONS: Record<string, typeof Send> = {
  new: CircleDot,
  validated: CheckCircle,
  contacted: Send,
  replied: MessageSquare,
  interested: Eye,
  booked: CalendarCheck,
  qualified: Star,
  disqualified: Ban,
};

const STAGE_COLORS: Record<string, string> = {
  new: 'text-muted-foreground',
  validated: 'text-info',
  contacted: 'text-primary',
  replied: 'text-warning',
  interested: 'text-success',
  booked: 'text-success',
  qualified: 'text-success',
  disqualified: 'text-destructive',
};

const TIER_COLORS: Record<string, string> = {
  A: 'bg-success/15 text-success border-success/30',
  B: 'bg-warning/15 text-warning border-warning/30',
  C: 'bg-muted/30 text-muted-foreground border-border',
};

export default function CrmPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'score' | 'created_at'>('score');
  const [refreshKey, setRefreshKey] = useState(0);
  const { realOnly } = useDashboard();

  const params = new URLSearchParams();
  if (stageFilter) params.set('status', stageFilter);
  if (tierFilter) params.set('tier', tierFilter);
  if (search) params.set('search', search);
  if (realOnly) params.set('real', 'true');

  const { data } = useSmartPoll<CrmData>(
    () => fetch(`/api/crm?${params}`).then(r => r.json()),
    { interval: 30_000, key: `${realOnly}-${refreshKey}` },
  );

  const leads = data?.leads || [];
  const sorted = [...leads].sort((a, b) => {
    if (sortField === 'score') return (b.score ?? 0) - (a.score ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleMutate = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">CRM</h1>
        {data?.summary && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{data.summary.total}</strong> leads</span>
            <span>avg score <strong className="text-foreground">{data.summary.avg_score}</strong></span>
            {data.summary.tier_breakdown.map(t => (
              <span key={t.tier} className={`badge border ${TIER_COLORS[t.tier] || ''}`}>
                Tier {t.tier}: {t.c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Funnel */}
      {data?.funnel && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Pipeline</h3>
          <div className="flex items-end gap-1 h-20">
            {data.funnel.filter(s => s.name !== 'disqualified').map(step => {
              const maxVal = Math.max(...data.funnel.map(s => s.value), 1);
              const height = Math.max((step.value / maxVal) * 100, 8);
              const Icon = STAGE_ICONS[step.name] || CircleDot;
              const isFiltered = stageFilter === step.name;
              return (
                <button
                  key={step.name}
                  onClick={() => setStageFilter(isFiltered ? '' : step.name)}
                  className={`flex-1 flex flex-col items-center gap-1 group transition-opacity ${
                    stageFilter && !isFiltered ? 'opacity-40' : ''
                  }`}
                >
                  <span className="text-xs font-mono font-semibold">{step.value}</span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isFiltered ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/60'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                  <div className="flex flex-col items-center gap-0.5">
                    <Icon size={12} className={STAGE_COLORS[step.name]} />
                    <span className="text-[9px] text-muted-foreground capitalize">{step.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
          className="bg-muted/50 border border-border/30 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
        </select>
        <button
          onClick={() => setSortField(sortField === 'score' ? 'created_at' : 'score')}
          className="btn btn-ghost btn-sm"
        >
          <ArrowUpDown size={12} />
          {sortField === 'score' ? 'Score' : 'Date'}
        </button>
        {(stageFilter || tierFilter || search) && (
          <button onClick={() => { setStageFilter(''); setTierFilter(''); setSearch(''); }} className="btn btn-ghost btn-sm text-destructive">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Lead List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {sorted.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted-foreground">No leads found</div>
          ) : (
            sorted.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                selected={selectedLead === lead.id}
                onClick={() => setSelectedLead(selectedLead === lead.id ? null : lead.id)}
              />
            ))
          )}
        </div>

        <div className="lg:col-span-1">
          {selectedLead ? (
            <LeadDetailPanel
              key={selectedLead}
              id={selectedLead}
              onClose={() => setSelectedLead(null)}
              onMutate={handleMutate}
            />
          ) : (
            <div className="card p-8 text-center text-sm text-muted-foreground sticky top-24">
              <Contact size={32} className="mx-auto mb-3 opacity-30" />
              <p>Select a lead to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Lead Row ─────────────────────────────────────────── */

function LeadRow({ lead, selected, onClick }: { lead: Lead & { pause_outreach?: number }; selected: boolean; onClick: () => void }) {
  const Icon = STAGE_ICONS[lead.status] || CircleDot;
  const isPaused = (lead as { pause_outreach?: number }).pause_outreach === 1;
  return (
    <button
      onClick={onClick}
      className={`card card-hover w-full text-left p-4 flex items-center gap-4 transition-all ${
        selected ? 'border-primary/50 bg-primary/5' : ''
      } ${isPaused ? 'opacity-60' : ''}`}
    >
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        {isPaused ? (
          <Pause size={14} className="text-warning" />
        ) : (
          <User size={16} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {lead.first_name} {lead.last_name}
          </span>
          {lead.tier && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_COLORS[lead.tier] || ''}`}>
              {lead.tier}
            </span>
          )}
          {isPaused && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
              paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {lead.company && (
            <span className="flex items-center gap-1 truncate">
              <Building2 size={10} /> {lead.company}
            </span>
          )}
          {lead.title && <span className="truncate">{lead.title}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={STAGE_COLORS[lead.status]} />
          <span className="text-xs capitalize">{lead.status}</span>
        </div>
        {lead.score != null && (
          <span className="text-xs font-mono font-semibold bg-muted/50 px-2 py-0.5 rounded">
            {lead.score}
          </span>
        )}
        <ChevronRight size={14} className="text-muted-foreground" />
      </div>
    </button>
  );
}

/* ─── Lead Detail Panel ────────────────────────────────── */

function LeadDetailPanel({ id, onClose, onMutate }: { id: string; onClose: () => void; onMutate: () => void }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [expandedSeq, setExpandedSeq] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);

  const { data, loading } = useSmartPoll<LeadDetail>(
    () => fetch(`/api/crm?id=${id}`).then(r => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    }),
    { interval: 30_000, key: detailRefresh },
  );

  // Sync notesValue when data loads
  useEffect(() => {
    if (data?.lead?.notes !== undefined) {
      setNotesValue(data.lead.notes || '');
    }
  }, [data?.lead?.notes]);

  function showFeedback(type: 'success' | 'error', msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 2500);
  }

  async function patchLead(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error('Update failed');
      showFeedback('success', 'Updated');
      setDetailRefresh(k => k + 1);
      onMutate();
    } catch {
      showFeedback('error', 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function patchSequence(seqId: string, status: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: seqId, type: 'sequence', status }),
      });
      if (!res.ok) throw new Error('Update failed');
      showFeedback('success', status === 'approved' ? 'Email approved' : 'Email rejected');
      setDetailRefresh(k => k + 1);
      onMutate();
    } catch {
      showFeedback('error', 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="card p-6 sticky top-24 flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-6 sticky top-24 text-center space-y-2">
        <XCircle size={24} className="mx-auto text-destructive/60" />
        <p className="text-sm text-muted-foreground">Failed to load lead</p>
        <button onClick={() => setDetailRefresh(k => k + 1)} className="btn btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  const { lead, sequences, timeline } = data;
  const isPaused = (lead as { pause_outreach?: number }).pause_outreach === 1;
  const currentStageIdx = STAGES.indexOf(lead.status as typeof STAGES[number]);
  const canAdvance = currentStageIdx >= 0 && currentStageIdx < STAGES.length - 1;
  const canRevert = currentStageIdx > 0;

  return (
    <div className="card p-5 space-y-4 sticky top-24 animate-slide-in max-h-[calc(100vh-8rem)] overflow-y-auto">
      {/* Feedback */}
      {feedback && (
        <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 animate-in ${
          feedback.type === 'success' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
        }`}>
          {feedback.type === 'success' ? <Check size={12} /> : <XCircle size={12} />}
          {feedback.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{lead.first_name} {lead.last_name}</h3>
          <p className="text-xs text-muted-foreground">{lead.title} at {lead.company}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {/* Contact Info */}
      <div className="space-y-1.5">
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-xs hover:text-primary transition-colors">
            <Mail size={12} className="text-muted-foreground shrink-0" />
            <span className="font-mono truncate">{lead.email}</span>
          </a>
        )}
        {lead.linkedin_url && (
          <a href={lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs hover:text-primary transition-colors">
            <Linkedin size={12} className="text-muted-foreground shrink-0" />
            <span className="truncate">{lead.linkedin_url}</span>
          </a>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <div className="text-sm font-semibold">{lead.score ?? '\u2014'}</div>
          <div className="text-[9px] text-muted-foreground uppercase">Score</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <select
            value={lead.tier || ''}
            onChange={e => patchLead({ tier: e.target.value || null })}
            disabled={saving}
            className="bg-transparent text-sm font-semibold text-center w-full cursor-pointer focus:outline-none disabled:opacity-50"
          >
            <option value="">--</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
          <div className="text-[9px] text-muted-foreground uppercase">Tier</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <div className="text-sm font-semibold capitalize">{lead.status}</div>
          <div className="text-[9px] text-muted-foreground uppercase">Stage</div>
        </div>
      </div>

      {/* Stage Controls */}
      <div className="flex items-center gap-2">
        <button
          disabled={!canRevert || saving}
          onClick={() => patchLead({ status: STAGES[currentStageIdx - 1] })}
          className="btn btn-ghost btn-sm flex-1 disabled:opacity-30"
          title="Previous stage"
        >
          <ChevronLeft size={14} />
          {canRevert ? STAGES[currentStageIdx - 1] : 'Back'}
        </button>
        <button
          disabled={!canAdvance || saving}
          onClick={() => patchLead({ status: STAGES[currentStageIdx + 1] })}
          className="btn btn-sm flex-1 bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-30"
          title="Advance stage"
        >
          {canAdvance ? STAGES[currentStageIdx + 1] : 'Done'}
          <ChevronRight size={14} />
        </button>
        {lead.status !== 'disqualified' && (
          <button
            disabled={saving}
            onClick={() => patchLead({ status: 'disqualified' })}
            className="btn btn-ghost btn-sm text-destructive hover:bg-destructive/10"
            title="Disqualify"
          >
            <Ban size={14} />
          </button>
        )}
      </div>

      {/* Pause Toggle */}
      <button
        onClick={() => patchLead({ pause_outreach: isPaused ? 0 : 1 })}
        disabled={saving}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          isPaused
            ? 'bg-warning/15 text-warning border border-warning/30'
            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
        }`}
      >
        <span className="flex items-center gap-2">
          {isPaused ? <Pause size={12} /> : <Play size={12} />}
          {isPaused ? 'Outreach Paused' : 'Outreach Active'}
        </span>
        <span className="text-[10px] opacity-70">{isPaused ? 'Click to resume' : 'Click to pause'}</span>
      </button>

      {/* Details */}
      <div className="space-y-1 text-xs">
        {lead.industry_segment && (
          <div className="flex justify-between"><span className="text-muted-foreground">Industry</span><span>{lead.industry_segment}</span></div>
        )}
        {lead.company_size && (
          <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{lead.company_size}</span></div>
        )}
        {lead.source && (
          <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{lead.source}</span></div>
        )}
        {lead.sequence_name && (
          <div className="flex justify-between"><span className="text-muted-foreground">Sequence</span><span>{lead.sequence_name}</span></div>
        )}
        {lead.last_touch_at && (
          <div className="flex justify-between"><span className="text-muted-foreground">Last Touch</span><span>{timeAgo(lead.last_touch_at)}</span></div>
        )}
        {lead.reply_type && (
          <div className="flex justify-between"><span className="text-muted-foreground">Reply Type</span><span className="capitalize">{lead.reply_type.replace('_', ' ')}</span></div>
        )}
      </div>

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Edit3 size={12} /> Notes
          </h4>
          {!editingNotes && (
            <button
              onClick={() => { setEditingNotes(true); setNotesValue(lead.notes || ''); }}
              className="text-[10px] text-primary hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              placeholder="Add notes about this lead..."
              rows={3}
              className="w-full text-xs bg-muted/30 border border-border/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditingNotes(false)}
                className="btn btn-ghost btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  patchLead({ notes: notesValue });
                  setEditingNotes(false);
                }}
                disabled={saving}
                className="btn btn-sm text-xs bg-primary/15 text-primary hover:bg-primary/25"
              >
                <Save size={12} /> Save
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-muted/20 rounded-lg p-3 text-xs min-h-[2rem]">
            {lead.notes || <span className="text-muted-foreground italic">No notes yet</span>}
          </div>
        )}
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock size={12} /> Timeline
          </h4>
          <div className="space-y-3 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
            {timeline.map(event => (
              <div key={event.id} className="flex items-start gap-3 pl-0 relative">
                <div className={`w-[15px] h-[15px] rounded-full border-2 border-background shrink-0 z-10 ${
                  event.type === 'pending_approval' ? 'bg-warning' :
                  event.type === 'approved' ? 'bg-success' :
                  'bg-muted'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed">{event.description}</p>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Sequences */}
      {sequences.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Send size={12} /> Email Sequences ({sequences.length})
          </h4>
          <div className="space-y-1.5">
            {sequences.map(seq => (
              <div key={seq.id} className="bg-muted/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedSeq(expandedSeq === seq.id ? null : seq.id)}
                  className="w-full flex items-center justify-between text-xs px-3 py-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="truncate text-left">
                    <span className="text-muted-foreground">Step {seq.step}: </span>
                    {seq.subject || 'No subject'}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`${
                      seq.status === 'sent' ? 'text-success' :
                      seq.status === 'pending_approval' ? 'text-warning' :
                      seq.status === 'approved' ? 'text-info' :
                      seq.status === 'cancelled' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {seq.status === 'pending_approval' ? 'pending' : seq.status}
                    </span>
                    {expandedSeq === seq.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>
                </button>

                {expandedSeq === seq.id && (
                  <div className="border-t border-border/20 px-3 py-2 space-y-2">
                    {seq.body ? (
                      <div className="text-xs bg-background/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">
                        {seq.body}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No email body available</p>
                    )}
                    {seq.scheduled_for && (
                      <p className="text-[10px] text-muted-foreground">
                        Scheduled: {new Date(seq.scheduled_for).toLocaleString()}
                      </p>
                    )}
                    {seq.sent_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Sent: {new Date(seq.sent_at).toLocaleString()}
                      </p>
                    )}

                    {/* Approval actions for pending emails */}
                    {seq.status === 'pending_approval' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => patchSequence(seq.id, 'approved')}
                          disabled={saving}
                          className="btn btn-sm text-xs bg-success/15 text-success hover:bg-success/25 flex-1"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          onClick={() => patchSequence(seq.id, 'cancelled')}
                          disabled={saving}
                          className="btn btn-sm text-xs bg-destructive/15 text-destructive hover:bg-destructive/25 flex-1"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
