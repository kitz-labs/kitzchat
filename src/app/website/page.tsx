'use client';

import { useMemo } from 'react';
import { Globe, Layout, PenLine, Rocket, LineChart, MessageCircle, Lock } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { WebsiteFtpSettings } from '@/components/admin/website-ftp-settings';

export default function WebsiteManagerPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });

  const websiteUrl = 'https://www.aikitz.at';

  const sections = useMemo(() => ([
    {
      title: 'Website Überblick',
      icon: Globe,
      body: (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Ziel: Content, Design, Analytics und Deployments für <span className="font-medium text-foreground">www.aikitz.at</span> zentral verwalten.
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={websiteUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Website öffnen</a>
            <a href="/analytics" className="btn btn-ghost btn-sm">Analytics</a>
          </div>
        </div>
      ),
    },
    {
      title: 'Content / Texte',
      icon: PenLine,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Vorbereitung für: Seiten-Inhalte, Textbausteine, CTA-Varianten, SEO-Texte, FAQ.</div>
          <div className="text-xs">Nächster Schritt: Content-Quellen anbinden (z.B. Files/Repo/Headless CMS) und versioniert speichern.</div>
        </div>
      ),
    },
    {
      title: 'Design / Layout',
      icon: Layout,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Vorbereitung für: Farben, Komponenten, Layout-Varianten, Branding, Assets.</div>
          <div className="text-xs">Nächster Schritt: Theme-Token + Asset-Registry in einem sicheren Admin-Flow.</div>
        </div>
      ),
    },
    {
      title: 'Analytics / Daten',
      icon: LineChart,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Vorbereitung für: Traffic, Leads, Conversions, Top Pages, Kampagnen.</div>
          <div className="text-xs">Tipp: Nutze die bestehende Analytics-Seite, bis hier eine Website-spezifische Detailansicht ergänzt wird.</div>
        </div>
      ),
    },
    {
      title: 'Deployment / FTP',
      icon: Rocket,
      body: (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Lock size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Konfiguration</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Hinterlege FTP-Zugangsdaten für spätere Deployments. In dieser Phase wird noch kein automatisches Live-FTP-Deployment ausgeführt.
          </div>
          <WebsiteFtpSettings />
        </div>
      ),
    },
    {
      title: 'Website-Agent / Chat für Änderungen',
      icon: MessageCircle,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Vorbereitung für einen Agenten, der Änderungen vorschlägt (Text, Struktur, SEO) und später Deployments anstößt.</div>
          <div className="text-xs">Nächster Schritt: Agenten-Workflow definieren (Preview → Freigabe → Deploy) inkl. Rollback.</div>
        </div>
      ),
    },
  ]), []);

  if (!ready) return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryTile label="Website" value="www.aikitz.at" icon={<Globe size={16} />} />
        <SummaryTile label="Status" value="Vorbereitung" icon={<Rocket size={16} />} />
        <SummaryTile label="Modus" value="Sicher" icon={<Lock size={16} />} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">www.aikitz.at</h1>
            <p className="text-xs text-muted-foreground">
              Management-Basis für Website-Content, Design, Analytics und sichere Deployments. (Kein Live-FTP in dieser Phase.)
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="panel">
              <div className="panel-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-primary" />
                  <div className="text-sm font-semibold">{section.title}</div>
                </div>
              </div>
              <div className="panel-body">{section.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-body flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-lg font-semibold truncate">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}
