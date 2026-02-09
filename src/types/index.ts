// ─── Content ───────────────────────────────────────────
export type ContentPlatform = 'x' | 'linkedin';
export type ContentFormat = 'short_post' | 'thread' | 'carousel' | 'text_post';
export type ContentStatus = 'draft' | 'pending_approval' | 'ready' | 'published' | 'rejected';
export type ContentPillar = 1 | 2 | 3 | 4 | 5;

export interface ContentPost {
  id: string;
  platform: ContentPlatform;
  format: ContentFormat;
  pillar: ContentPillar | null;
  text_preview: string | null;
  full_content: string | null;
  status: ContentStatus;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  engagement_rate: number;
}

// ─── Leads ─────────────────────────────────────────────
export type LeadStatus = 'new' | 'validated' | 'contacted' | 'replied' | 'interested' | 'booked' | 'qualified' | 'disqualified';
export type LeadTier = 'A' | 'B' | 'C';

export interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  company_size: string | null;
  industry_segment: string | null;
  source: string | null;
  email: string | null;
  linkedin_url: string | null;
  status: LeadStatus;
  score: number | null;
  tier: LeadTier | null;
  last_touch_at: string | null;
  next_action_at: string | null;
  sequence_name: string | null;
  reply_type: string | null;
  notes: string | null;
  pause_outreach: number;
  created_at: string;
}

// ─── Sequences ─────────────────────────────────────────
export type SequenceStatus = 'queued' | 'pending_approval' | 'approved' | 'sent' | 'cancelled';

export interface Sequence {
  id: string;
  lead_id: string;
  sequence_name: string | null;
  step: number | null;
  subject: string | null;
  body: string | null;
  status: SequenceStatus | null;
  tier: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
}

// ─── Suppression ───────────────────────────────────────
export type SuppressionType = 'opt_out' | 'bounce' | 'domain_block';

export interface Suppression {
  email: string;
  type: SuppressionType | null;
  added_at: string;
}

// ─── Engagement ────────────────────────────────────────
export type EngagementPlatform = 'x' | 'linkedin';
export type EngagementAction = 'reply' | 'quote_tweet' | 'comment' | 'follow' | 'dm';
export type EngagementStatus = 'sent' | 'draft' | 'pending';

export interface Engagement {
  id: number;
  platform: EngagementPlatform | null;
  action_type: EngagementAction | null;
  target_url: string | null;
  target_username: string | null;
  our_text: string | null;
  status: EngagementStatus | null;
  created_at: string;
}

// ─── Signals ───────────────────────────────────────────
export type SignalType = 'pain' | 'hiring' | 'launch' | 'competitor' | 'brand_mention' | 'opportunity';
export type SignalRelevance = 'high' | 'medium' | 'low';

export interface Signal {
  id: number;
  date: string | null;
  type: SignalType | null;
  username: string | null;
  tweet_url: string | null;
  summary: string | null;
  relevance: SignalRelevance | null;
  action_taken: string | null;
  likes: number | null;
  impressions: number | null;
  created_at: string;
}

// ─── Experiments ───────────────────────────────────────
export type ExperimentStatus = 'proposed' | 'running' | 'completed';
export type ExperimentDecision = 'SCALE' | 'ITERATE' | 'KILL';

export interface Experiment {
  id: number;
  week: number | null;
  hypothesis: string | null;
  action: string | null;
  metric: string | null;
  win_threshold: string | null;
  status: ExperimentStatus | null;
  results: string | null;
  winner: string | null;
  margin: string | null;
  decision: ExperimentDecision | null;
  learning: string | null;
  next_action: string | null;
  proposed_at: string | null;
  completed_at: string | null;
}

// ─── Learnings ─────────────────────────────────────────
export interface Learning {
  id: number;
  learning: string | null;
  validated_week: number | null;
  confidence: string | null;
  applied_to: string | null;
  created_at: string;
}

// ─── Daily Metrics ─────────────────────────────────────
export interface DailyMetrics {
  date: string;
  x_posts: number;
  x_threads: number;
  linkedin_drafts: number;
  x_replies: number;
  x_quote_tweets: number;
  x_follows: number;
  linkedin_comments: number;
  discoveries: number;
  enrichments: number;
  sends: number;
  replies_triaged: number;
  opt_outs: number;
  bounces: number;
  total_impressions: number;
  total_engagement: number;
}

// ─── Activity Log ──────────────────────────────────────
export interface ActivityEntry {
  id: number;
  ts: string | null;
  action: string | null;
  detail: string | null;
  result: string | null;
}

// ─── Notifications ────────────────────────────────────
export type NotificationType = 'daily_report' | 'alert' | 'lead_reply' | 'bounce_spike' | 'experiment_result' | 'custom';
export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface Notification {
  id: number;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string | null;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

// ─── Agent Runtime ────────────────────────────────────
export type AgentStatus = 'active' | 'idle' | 'error' | 'planned';

export interface AgentStats {
  actions_today: number;
  actions_week: number;
  last_action: string | null;
  last_action_at: string | null;
  top_skills: { skill: string; count: number }[];
}

export interface AgentRuntime {
  id: string;
  status: AgentStatus;
  stats: AgentStats;
  recent_activity: ActivityEntry[];
}

// ─── CRM ──────────────────────────────────────────────
export interface LeadDetail extends Lead {
  sequences: Sequence[];
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  id: number;
  type: 'sequence_sent' | 'reply_received' | 'stage_change' | 'note' | 'discovery';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Automations ──────────────────────────────────────
export interface ApprovalItem {
  id: string;
  type: 'content' | 'email';
  title: string;
  preview: string;
  agent: string;
  created_at: string;
  platform?: string;
  tier?: string;
}

export interface SkillExecution {
  skill: string;
  agent: string;
  count: number;
  last_run: string | null;
}

// ─── Dashboard Aggregates ──────────────────────────────
export interface OverviewStats {
  posts_today: number;
  engagement_today: number;
  emails_sent: number;
  pipeline_count: number;
}

export interface Alert {
  id: string;
  type: 'warning' | 'info' | 'error';
  message: string;
  created_at: string;
}

export interface FunnelStep {
  name: string;
  value: number;
}

export interface WeeklyKPI {
  week: string;
  leads_added: number;
  emails_sent: number;
  reply_rate: number;
  positive_reply_rate: number;
  calls_booked: number;
  sqls: number;
  impressions: number;
  engagement_rate: number;
}
