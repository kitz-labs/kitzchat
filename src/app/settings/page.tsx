'use client';

import { useState, useEffect } from 'react';
import {
  Settings, Database, Clock, Shield, Info, ExternalLink,
  RefreshCw, Trash2, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface SyncInfo {
  db_path: string;
  state_dir: string;
  db_size_mb: number;
  tables: { name: string; count: number }[];
  last_sync: string | null;
  seed_count: number;
}

export default function SettingsPage() {
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSyncInfo).catch(() => {});
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync');
      toast.success('Sync completed');
      // Refresh info
      const info = await fetch('/api/settings').then(r => r.json());
      setSyncInfo(info);
    } catch {
      toast.error('Sync failed');
    }
    setSyncing(false);
  }

  async function clearSeeds() {
    if (!confirm('Remove all seed data? Real data will be preserved.')) return;
    setClearing(true);
    try {
      await fetch('/api/seed', { method: 'DELETE' });
      toast.success('Seed data cleared');
      const info = await fetch('/api/settings').then(r => r.json());
      setSyncInfo(info);
    } catch {
      toast.error('Failed to clear seeds');
    }
    setClearing(false);
  }

  return (
    <div className="space-y-6 animate-in max-w-2xl">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Settings size={20} /> Settings
      </h1>

      {/* Database Info */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Database size={14} className="text-primary" /> Database
        </h2>

        {syncInfo ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">DB Path</span>
                <code className="text-[11px] bg-muted px-2 py-1 rounded block truncate">
                  {syncInfo.db_path}
                </code>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">State Directory</span>
                <code className="text-[11px] bg-muted px-2 py-1 rounded block truncate">
                  {syncInfo.state_dir}
                </code>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Database Size</span>
                <span className="font-mono">{syncInfo.db_size_mb.toFixed(2)} MB</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Seed Records</span>
                <span className="font-mono">{syncInfo.seed_count}</span>
              </div>
            </div>

            {/* Table row counts */}
            <div>
              <span className="text-xs text-muted-foreground block mb-2">Tables</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {syncInfo.tables.map(t => (
                  <div key={t.name} className="bg-muted/30 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-xs">{t.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
      </div>

      {/* Sync Controls */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <RefreshCw size={14} className="text-success" /> Sync
        </h2>
        <p className="text-xs text-muted-foreground">
          The dashboard syncs 14 JSON state files from the agent workspace into SQLite every 30 seconds.
        </p>
        <div className="flex gap-3">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="btn btn-primary text-sm flex items-center gap-2"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={clearSeeds}
            disabled={clearing}
            className="btn btn-destructive text-sm flex items-center gap-2"
          >
            <Trash2 size={14} />
            {clearing ? 'Clearing...' : 'Clear Seed Data'}
          </button>
        </div>
      </div>

      {/* Agent Configuration */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Shield size={14} className="text-warning" /> Agent Configuration
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Gateway</span>
            <code className="bg-muted px-2 py-0.5 rounded">localhost:18802</code>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Primary Model</span>
            <span>Claude Sonnet 4</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Fallback Models</span>
            <span>Haiku 4.5, Qwen 2.5 14B</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Agents</span>
            <span>Hermes (marketing) + Apollo (sales)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Cron Jobs</span>
            <span>10 scheduled (weekdays)</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Skills</span>
            <span>8 active</span>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Info size={14} className="text-info" /> About
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Dashboard</span>
            <span>Hermes Dashboard v1.0</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Runtime</span>
            <span>Next.js 16 + SQLite (WAL)</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Agent Platform</span>
            <span>OpenClaw 2026.2.6-3</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Source</span>
            <a
              href="https://github.com/0xNyk/hermes-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              GitHub <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium">Keyboard Shortcuts</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['⌘K', 'Command palette / search'],
            ['⌘.', 'Toggle live feed'],
            ['Esc', 'Close dialogs'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center gap-3 py-1">
              <kbd className="bg-muted px-2 py-0.5 rounded font-mono text-[11px] min-w-[32px] text-center">
                {key}
              </kbd>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
