'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Tag, X } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type TemplateMeta = {
  slug: string;
  title: string;
  category: string;
  description: string;
  filename: string;
  tags: string[];
  preview: string;
};

function TagPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-border/60 bg-muted/10 px-2.5 py-1 text-[11px] text-muted-foreground">
      {text}
    </span>
  );
}

export default function DownloadsPage() {
  const { ready, appAudience } = useAudienceGuard({ redirectAdminTo: '/', redirectOnErrorTo: '/' });
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('Alle');

  useEffect(() => {
    if (!ready) return;
    if (appAudience !== 'customer') return;

    let alive = true;
    setLoading(true);
    setError(null);

    fetch('/api/customer/downloads/templates', { cache: 'no-store' })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || 'Downloads konnten nicht geladen werden');
        if (!alive) return;
        setTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
      })
      .catch((err) => {
        if (!alive) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [ready, appAudience]);

  const selected = useMemo(
    () => templates.find((t) => t.slug === selectedSlug) || null,
    [templates, selectedSlug],
  );

  const categories = useMemo(() => {
    const values = Array.from(new Set(templates.map((t) => (t.category || '').trim()).filter(Boolean)));
    values.sort((a, b) => a.localeCompare(b, 'de-DE'));
    return ['Alle', ...values];
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    if (activeCategory === 'Alle') return templates;
    return templates.filter((t) => (t.category || '').trim() === activeCategory);
  }, [templates, activeCategory]);

  if (!ready) return <div className="min-h-[40vh]" />;
  if (appAudience !== 'customer') return null;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Downloads</h1>
          <p className="text-xs text-muted-foreground">
            Fertige CSV-Vorlagen fuer Agenten, Automationen und Datenbanken. Card anklicken → Preview → Download.
          </p>
        </div>
        <a className="btn btn-primary btn-sm" href="/hilfe?topic=downloads">
          Hilfe
        </a>
      </div>

      {!loading && !error && templates.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`h-9 px-3 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-background/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />
      ) : error ? (
        <div className="panel">
          <div className="panel-body">
            <div className="text-sm font-medium">Downloads nicht verfuegbar</div>
            <div className="mt-1 text-xs text-muted-foreground">{error}</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {visibleTemplates.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setSelectedSlug(t.slug)}
              className="rounded-2xl border border-border/60 bg-background/40 hover:bg-background/60 transition-colors p-4 text-left card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <img src="/icons/csv-download.svg" alt="CSV" className="h-8 w-8 opacity-90" />
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.category}</div>
                </div>
                <FileSpreadsheet size={16} className="text-muted-foreground" />
              </div>
              <div className="mt-3 text-sm font-semibold leading-snug line-clamp-2">{t.title}</div>
              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</div>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSlug('')} />
          <div className="absolute left-1/2 top-1/2 w-[min(920px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-3xl border border-border/60 bg-card/95 shadow-2xl overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-5 border-b border-border/60">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{selected.category}</div>
                  <div className="mt-1 text-lg font-semibold truncate">{selected.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{selected.description}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedSlug('')}>
                  <X size={16} /> Schliessen
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Tag size={14} /> Tags:
                    </span>
                    {selected.tags.map((tag) => <TagPill key={tag} text={tag} />)}
                  </div>

                  <a
                    className="btn btn-primary"
                    href={`/api/customer/downloads/templates/${encodeURIComponent(selected.slug)}`}
                    download
                  >
                    <Download size={16} /> CSV herunterladen
                  </a>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <div className="text-sm font-semibold">Preview</div>
                  <div className="mt-2 overflow-auto max-h-[52vh]">
                    <pre className="whitespace-pre text-xs leading-relaxed font-mono text-foreground">
                      {selected.preview}
                    </pre>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Datei: <span className="font-mono">{selected.filename}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  Wenn du Support brauchst (Import/Format/Mapping): schreibe uns im <a className="underline hover:text-foreground" href="/support-chat">Support</a>.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
