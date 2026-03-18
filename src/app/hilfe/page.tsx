'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, LifeBuoy, Search } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { HELP_ARTICLES, type HelpArticle } from '@/data/help/articles';
import { HelpUsageTable } from '@/components/help/help-usage-table';

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function ArticleBody({ article }: { article: HelpArticle }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{article.category}</div>
            <div className="mt-1 text-lg font-semibold">{article.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{article.summary}</div>
          </div>
          <div className="flex items-center gap-2">
            <a className="btn btn-primary btn-sm" href="/support-chat">
              <LifeBuoy size={14} /> Support
            </a>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {article.sections.map((s, idx) => {
            if (s.kind === 'p') {
              return <p key={idx} className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>;
            }
            if (s.kind === 'note') {
              return (
                <div key={idx} className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  {s.text}
                </div>
              );
            }
            if (s.kind === 'steps') {
              return (
                <div key={idx} className="space-y-2">
                  {s.title ? <div className="text-sm font-semibold">{s.title}</div> : null}
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                    {s.items.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
              );
            }
            if (s.kind === 'links') {
              return (
                <div key={idx} className="space-y-2">
                  {s.title ? <div className="text-sm font-semibold">{s.title}</div> : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {s.items.map((l) => (
                      <a key={l.href + l.label} href={l.href} className="rounded-2xl border border-border/60 bg-background/40 p-3 hover:bg-background/60 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{l.label}</div>
                            {l.note ? <div className="text-xs text-muted-foreground mt-0.5">{l.note}</div> : null}
                          </div>
                          <ArrowRight size={16} className="text-muted-foreground" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              );
            }
            if (s.kind === 'example') {
              return (
                <div key={idx} className="space-y-2">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground font-mono">{s.text}</pre>
                  </div>
                </div>
              );
            }
            if (s.kind === 'usage_table') {
              return <HelpUsageTable key={idx} days={s.days} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

export default function HilfePage() {
  const { ready, appAudience } = useAudienceGuard({ redirectOnErrorTo: '/' });
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Alle');

  const topic = normalize(searchParams.get('topic') || '');

  const baseByAudience = useMemo(() => {
    const audience = appAudience || 'admin';
    return HELP_ARTICLES.filter((a) => {
      if (audience === 'customer' && a.audience === 'admin') return false;
      if (audience === 'admin' && a.audience === 'customer') return false;
      return true;
    });
  }, [appAudience]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(baseByAudience.map((a) => a.category))).sort((a, b) => a.localeCompare(b));
  }, [baseByAudience]);

  useEffect(() => {
    if (activeCategory === 'Alle') return;
    if (!availableCategories.includes(activeCategory)) {
      setActiveCategory('Alle');
    }
  }, [activeCategory, availableCategories]);

  const filtered = useMemo(() => {
    const audience = appAudience || 'admin';
    const q = normalize(query);
    return HELP_ARTICLES.filter((a) => {
      if (audience === 'customer' && a.audience === 'admin') return false;
      if (audience === 'admin' && a.audience === 'customer') return false;
      if (activeCategory !== 'Alle' && a.category !== activeCategory) return false;
      if (!q) return true;
      const hay = `${a.title} ${a.summary} ${a.category} ${a.sections.map((s) => (s.kind === 'p' || s.kind === 'note' ? s.text : '')).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeCategory]);

  const current = useMemo(() => {
    if (topic) return HELP_ARTICLES.find((a) => a.slug === topic) || null;
    return null;
  }, [topic]);

  function setTopic(slug: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('topic', slug);
    router.push(url.pathname + url.search);
  }

  if (!ready) return <div className="min-h-[40vh]" />;
  if (!appAudience) return null;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Hilfe Center</h1>
          <p className="text-xs text-muted-foreground">
            {appAudience === 'admin'
              ? 'Betrieb, Konfiguration und Best Practices – kompakt und umsetzbar.'
              : 'Step-by-step Anleitungen, Beispiele und schnelle Lösungen für deinen Kundenbereich.'}
          </p>
        </div>
        <a className="btn btn-primary btn-sm" href="/support-chat">
          <LifeBuoy size={14} /> Support Chat
        </a>
      </div>

      <div className="panel">
        <div className="panel-body space-y-3">
          <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suche nach Agenten, Guthaben, Passwort, Stripe, Support …"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm ${activeCategory === 'Alle' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveCategory('Alle')}
            >
              Alle
            </button>
            {availableCategories.map((c) => (
              <button
                key={c}
                type="button"
                className={`btn btn-sm ${activeCategory === c ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="panel">
          <div className="panel-body">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Themen</div>
            <div className="mt-3 space-y-2">
              {filtered.map((a) => {
                const Icon = a.icon;
                const active = current?.slug === a.slug;
                return (
                  <button
                    key={a.slug}
                    type="button"
                    className={`w-full text-left rounded-2xl border px-3 py-3 transition-colors ${
                      active
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border/60 bg-background/40 hover:bg-background/60'
                    }`}
                    onClick={() => setTopic(a.slug)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl ${active ? 'bg-primary/15 text-primary' : 'bg-muted/10 text-muted-foreground'}`}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.summary}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  Keine Treffer. Tipp: Suche nach „Guthaben“, „Agent“, „Passwort“, „Support“.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {current ? (
          <ArticleBody article={current} />
        ) : (
          <div className="panel">
            <div className="panel-body">
              <div className="text-sm font-semibold">Wähle links ein Thema</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Starte mit <button className="text-primary hover:underline" onClick={() => setTopic('start')}>Schnellstart</button> oder nutze die Suche.
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <a href="/agents" className="rounded-2xl border border-border/60 bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="text-sm font-semibold">Agenten öffnen</div>
                  <div className="mt-1 text-xs text-muted-foreground">Agenten auswählen & direkt starten</div>
                </a>
                <a href="/usage-token" className="rounded-2xl border border-border/60 bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="text-sm font-semibold">Guthaben / Tokens</div>
                  <div className="mt-1 text-xs text-muted-foreground">Top-ups, Nutzung & Rechnungen</div>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
