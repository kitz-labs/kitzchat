'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bot, CreditCard, FileText, Mail, MessageCircle, Rocket, ShieldCheck, Sparkles } from 'lucide-react';

type MeUser = {
  id: number;
  username: string;
  wallet_balance_cents?: number;
  has_agent_access?: boolean;
  payment_status?: 'not_required' | 'pending' | 'paid';
};

type WorkflowTile = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  tone: 'primary' | 'success' | 'warning' | 'info';
};

function tileTone(tone: WorkflowTile['tone']) {
  if (tone === 'success') return 'border-success/30 bg-success/10 hover:bg-success/15';
  if (tone === 'warning') return 'border-warning/30 bg-warning/10 hover:bg-warning/15';
  if (tone === 'info') return 'border-info/30 bg-info/10 hover:bg-info/15';
  return 'border-primary/30 bg-primary/10 hover:bg-primary/15';
}

export function CustomerHome() {
  const [me, setMe] = useState<MeUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload) => setMe(payload?.user || null))
      .catch(() => setMe(null));
  }, []);

  const tiles = useMemo<WorkflowTile[]>(
    () => [
      {
        title: 'Sofort starten',
        subtitle: 'Sag dein Ziel – Master Agent baut den Plan.',
        icon: <Sparkles size={18} />,
        href: '/chat?agent=main&template=quickstart',
        tone: 'primary',
      },
      {
        title: 'Mehr Leads',
        subtitle: 'Positionierung, Hook, Offer, CTA – in 1 Minute.',
        icon: <Rocket size={18} />,
        href: '/chat?agent=marketing&template=leads',
        tone: 'success',
      },
      {
        title: 'Kampagne bauen',
        subtitle: 'Kanalplan + Varianten + Messplan.',
        icon: <Bot size={18} />,
        href: '/chat?agent=campaign-studio&template=campaign',
        tone: 'info',
      },
      {
        title: 'E‑Mail schreiben',
        subtitle: 'Professionell, klar, copy‑paste fertig.',
        icon: <Mail size={18} />,
        href: '/chat?agent=mail-agent&template=email',
        tone: 'primary',
      },
      {
        title: 'Support‑Antwort',
        subtitle: 'Freundlich, souverän, deeskalierend.',
        icon: <ShieldCheck size={18} />,
        href: '/chat?agent=support-concierge&template=support',
        tone: 'warning',
      },
      {
        title: 'Dokumente ordnen',
        subtitle: 'Ablage‑Struktur + Namensschema + To‑dos.',
        icon: <FileText size={18} />,
        href: '/chat?agent=docu-agent&template=docs',
        tone: 'info',
      },
      {
        title: 'Normal chatten',
        subtitle: 'Wie ChatGPT – nur auf Nexora getuned.',
        icon: <MessageCircle size={18} />,
        href: '/chat?agent=main',
        tone: 'primary',
      },
      {
        title: 'Guthaben verwalten',
        subtitle: 'Aufladen, Rechnungen, Status – einfach.',
        icon: <CreditCard size={18} />,
        href: '/usage-token',
        tone: 'success',
      },
    ],
    [],
  );

  const walletEur = ((Math.max(0, Math.round(me?.wallet_balance_cents ?? 0))) / 100).toFixed(2);
  const accessLabel = me?.has_agent_access ? 'Zugang aktiv' : 'Aktivierung offen';

  return (
    <div className="space-y-5 animate-in">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Was willst du heute erreichen?</h1>
            <p className="text-xs text-muted-foreground">Wähle ein Ziel – Nexora startet den passenden Workflow sofort.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="badge badge-neutral">{accessLabel}</span>
            <span className="badge border border-primary/30 bg-primary/10 text-foreground">Guthaben €{walletEur}</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <Link
                key={tile.href + tile.title}
                href={tile.href}
                className={`group rounded-2xl border p-4 transition-smooth ${tileTone(tile.tone)}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/40 border border-border/60 group-hover:border-border/80">
                    {tile.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{tile.title}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">{tile.subtitle}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Tipp</div>
              <div className="mt-1 text-sm font-semibold">Sag einfach dein Ziel.</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Beispiel: „Ich will 20 neue Leads pro Woche für &lt;Angebot&gt; in &lt;Markt&gt;.“
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Schnellhilfe</div>
              <div className="mt-1 text-sm font-semibold">Keine Ahnung, welcher Agent?</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Starte mit dem Master Agent – er routet und macht’s einfach.
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Nächster Schritt</div>
              <div className="mt-1 text-sm font-semibold">Agenten personalisieren</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Hinterlege deinen Kontext einmal – danach werden Ergebnisse deutlich stärker.
              </div>
              <div className="mt-3">
                <Link href="/agents" className="btn btn-primary btn-sm">Jetzt anpassen</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

