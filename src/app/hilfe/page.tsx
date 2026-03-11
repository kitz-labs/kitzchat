'use client';

import { useMemo, useState } from 'react';
import { BookOpenText, CircleHelp, CreditCard, MessageSquareText, Search } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

const FAQS = [
  {
    title: 'Wie schalte ich alle Agenten frei?',
    text: 'Gehe auf Guthaben und starte dort die erste Stripe-Zahlung. Danach wird dein Zugang automatisch freigeschaltet.',
    icon: CreditCard,
    category: 'Abrechnung',
  },
  {
    title: 'Wo finde ich mein Guthaben und Rechnungen?',
    text: 'Alle Guthaben-Informationen und PDF-Rechnungen liegen auf der Seite Guthaben.',
    icon: BookOpenText,
    category: 'Nutzung',
  },
  {
    title: 'Was mache ich bei Fragen oder Problemen?',
    text: 'Nutze den Support-Chat in den Einstellungen. Dort kannst du direkt eine Nachricht senden.',
    icon: MessageSquareText,
    category: 'Support',
  },
  {
    title: 'Wie funktioniert Datenschutz in KitzChat?',
    text: 'Deine Konto- und Integrationsdaten bleiben lokal in deinem KitzChat-System gespeichert. Uploads und Instagram-Daten werden nur fuer deinen Kundenbereich verwendet.',
    icon: CircleHelp,
    category: 'Datenschutz',
  },
  {
    title: 'Wo finde ich Nutzungsbedingungen und Datenschutz?',
    text: 'Ueber die Links im Footer erreichst du die Seiten Nutzungshinweise und Datenschutz mit allen verbindlichen Regeln und Kontakten.',
    icon: CircleHelp,
    category: 'Recht',
  },
  {
    title: 'Welche Konto-Informationen kann ich aendern?',
    text: 'In den Einstellungen kannst du deine E-Mail-Adresse, dein Passwort, Alerts, aktive Agenten und die Instagram-Verbindung verwalten.',
    icon: CircleHelp,
    category: 'Konto',
  },
  {
    title: 'Wie werden Tokens und Nutzung angezeigt?',
    text: 'Unter Guthaben siehst du taegliche und monatliche Nutzung, Rechnungen, Rabattstatus und dein verfuegbares Guthaben.',
    icon: BookOpenText,
    category: 'Nutzung',
  },
];

export default function HilfePage() {
  const { ready, appAudience } = useAudienceGuard({ redirectAdminTo: '/settings', redirectOnErrorTo: '/' });
  const [query, setQuery] = useState('');

  if (!ready) return <div className="min-h-[40vh]" />;
  if (appAudience !== 'customer') return null;

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAQS;
    return FAQS.filter((item) => `${item.title} ${item.text} ${item.category}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Hilfe</h1>
        <p className="text-xs text-muted-foreground">Antworten und Hilfestellungen rund um deinen KitzChat-Kundenbereich.</p>
      </div>

      <div className="panel">
        <div className="panel-body">
          <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suche nach Datenschutz, Konto, Nutzung, Alerts oder Support"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredFaqs.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="panel">
              <div className="panel-body space-y-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon size={18} />
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.category}</div>
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-sm text-muted-foreground">{item.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredFaqs.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
          Keine passenden Hilfeeintraege gefunden. Suche nach Begriffen wie Datenschutz, Instagram, Agenten, Guthaben oder Support.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-body flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CircleHelp size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold">Kurz erklärt</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Webchat ist dein Hauptarbeitsbereich. Agenten zeigt dir deine aktivierten Spezialisten. Guthaben buendelt Zahlungen, Rechnungen, Rabattstatus und Onboarding. Einstellungen enthalten Support, Konto, Alerts und Integrationen.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}