import { type LucideIcon, Rocket, Shield, CreditCard, Settings, BrainCircuit, MessageSquareText, Search, Wrench, Users, BookOpenText } from 'lucide-react';

export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  icon: LucideIcon;
  summary: string;
  audience: 'customer' | 'admin' | 'both';
  sections: Array<
    | { kind: 'p'; text: string }
    | { kind: 'steps'; title?: string; items: string[] }
    | { kind: 'links'; title?: string; items: { label: string; href: string; note?: string }[] }
    | { kind: 'example'; title: string; text: string }
    | { kind: 'note'; text: string }
    | { kind: 'usage_table'; days?: number }
  >;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'start',
    title: 'Schnellstart',
    category: 'Basics',
    icon: Rocket,
    summary: 'In 5 Minuten vom Login bis zum ersten Ergebnis – ohne KI-Vorwissen.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'KitzChat ist dein lokaler KI‑Arbeitsbereich: Du arbeitest in Chats/Agenten, verwaltest Zugriff und siehst Nutzung & Guthaben. Alles ist auf Business‑Workflows getrimmt.' },
      {
        kind: 'steps',
        title: 'Erster Ablauf',
        items: [
          'Registrieren → E‑Mail bestätigen → Einloggen.',
          'Falls Guthaben/Agenten gesperrt sind: Guthaben (Top‑up) durchführen.',
          'Agenten öffnen → passenden Agent auswählen → Aufgabe klar als Ziel formulieren.',
          'Ergebnis prüfen → ggf. mit Follow‑ups verfeinern (Beispiel unten).',
        ],
      },
      {
        kind: 'example',
        title: 'Beispiel-Prompt (dummy‑freundlich)',
        text: 'Ziel: Erstelle mir eine Schritt‑für‑Schritt To‑Do Liste für die Einführung eines neuen Produkts. Bitte in 3 Phasen: Vorbereitung, Launch, Nachbereitung. Jede Phase mit Zeitplan und Verantwortlichkeiten.',
      },
      {
        kind: 'links',
        title: 'Direkt weiter',
        items: [
          { label: 'Agenten', href: '/agents', note: 'Agenten auswählen und starten' },
          { label: 'Guthaben / Tokens', href: '/usage-token', note: 'Top‑ups, Nutzung, Onboarding' },
          { label: 'Einstellungen', href: '/settings', note: 'Konto, Support, Alerts' },
        ],
      },
    ],
  },
  {
    slug: 'account-register-verify',
    title: 'Registrierung & E-Mail bestaetigen',
    category: 'Konto',
    icon: Rocket,
    summary: 'So klappt Registrierung, Verifizierung und der erste Login – inkl. Fehlerbehebung.',
    audience: 'customer',
    sections: [
      { kind: 'p', text: 'Nach der Registrierung bekommst du eine Verifizierungs-E-Mail. Erst nach dem Klick auf den Link ist dein Konto vollstaendig aktiv.' },
      {
        kind: 'steps',
        title: 'Ablauf',
        items: [
          'Registrieren (Benutzername, E-Mail, Passwort).',
          'E-Mail oeffnen und den Verifizierungs-Link anklicken.',
          'Danach wirst du auf die Login-Seite geleitet („E-Mail bestaetigt“).',
          'Einloggen und direkt loslegen.',
        ],
      },
      {
        kind: 'note',
        text: 'Wenn der Link nicht oeffnet: pruefe, ob du wirklich auf „dashboard.aikitz.at“ bist (nicht 0.0.0.0 / localhost). Notfalls Link kopieren und in die Adresszeile einfuegen.',
      },
      { kind: 'links', items: [{ label: 'Login', href: '/login' }, { label: 'Support', href: '/support-chat', note: 'Wenn keine Mail ankommt oder Link fehlschlaegt' }] },
    ],
  },
  {
    slug: 'password-reset',
    title: 'Passwort vergessen / zuruecksetzen',
    category: 'Konto',
    icon: Settings,
    summary: 'Reset-Link anfordern und neues Passwort setzen.',
    audience: 'customer',
    sections: [
      { kind: 'p', text: 'Wenn du dein Passwort vergessen hast, kannst du es jederzeit per E-Mail zuruecksetzen. Aus Sicherheitsgruenden verraten wir nicht, ob eine E-Mail existiert.' },
      {
        kind: 'steps',
        title: 'Reset in 2 Minuten',
        items: [
          'Auf der Login-Seite „Passwort vergessen?“ klicken.',
          'E-Mail eingeben und Reset-Link anfordern.',
          'Link in der Mail oeffnen und neues Passwort setzen.',
          'Danach normal einloggen.',
        ],
      },
      {
        kind: 'links',
        items: [
          { label: 'Passwort vergessen', href: '/forgot-password' },
          { label: 'Support', href: '/support-chat', note: 'Wenn keine Mail kommt: Support hilft' },
        ],
      },
      { kind: 'note', text: 'Tipp: Verwende ein starkes Passwort und speichere es in einem Passwort-Manager.' },
    ],
  },
  {
    slug: 'agents',
    title: 'Agenten richtig nutzen',
    category: 'Agenten',
    icon: BrainCircuit,
    summary: 'So formulierst du Aufgaben, Inputs, Outputs und Quality‑Checks.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'Agenten sind vorkonfigurierte KI‑Workflows. Je besser Input & Erwartung, desto stabiler der Output. In der Agenten-Ansicht siehst du pro Agent „Input Format“ und „Output Format“ – das ist deine beste Vorlage.' },
      {
        kind: 'steps',
        title: 'Best Practice',
        items: [
          'Schreibe zuerst das Ziel (1 Satz), dann Kontext (3–7 Stichpunkte), dann gewünschtes Format (z.B. Tabelle).',
          'Gib Beispiele: „So soll die Antwort aussehen …“ (1 Mini‑Beispiel reicht).',
          'Füge Constraints hinzu: Tonalität, Länge, Sprache, Zielgruppe.',
          'Fordere am Ende eine Checkliste: Risiken, Annahmen, offene Fragen.',
          'Wenn du einen Agenten „konfigurierst“: passe nicht den Agenten selbst an, sondern gib deine Input/Output-Vorgaben im Prompt mit (Templates unten).',
        ],
      },
      {
        kind: 'example',
        title: 'Prompt-Template (Input/Output fixieren)',
        text: [
          'ZIEL: … (1 Satz)',
          'KONTEXT:',
          '- …',
          '- …',
          'INPUT (Daten, die ich gebe):',
          '- …',
          'OUTPUT (so will ich es):',
          '- Format: Tabelle',
          '- Spalten: Schritt | Aufgabe | Owner | ETA | Risiko',
          '- Sprache: Deutsch (Business, kurz)',
          'QUALITY CHECK:',
          '- Liste am Ende: Annahmen, Risiken, offene Fragen',
        ].join('\n'),
      },
      {
        kind: 'links',
        items: [
          { label: 'Agenten (Kundenbereich)', href: '/agents', note: 'Agenten auswählen und „Input/Output Format“ nutzen' },
          { label: 'Support', href: '/support-chat', note: 'Wenn du unsicher bist: Support hilft dir beim Setup' },
        ],
      },
      { kind: 'note', text: 'Wenn ein Agent „halluziniert“: Bitte um Quellen/Begründung, oder gib mehr Kontext/Beispiele.' },
    ],
  },
  {
    slug: 'agent-io',
    title: 'Input & Output pro Agent konfigurieren',
    category: 'Agenten',
    icon: BookOpenText,
    summary: 'Dummy-freundlich: so gibst du Daten rein und bekommst exakt das Format raus.',
    audience: 'customer',
    sections: [
      { kind: 'p', text: 'In KitzChat wird der „Agent“ als Profi-Workflow betrieben. Du steuerst die Ergebnisse ueber drei Dinge: 1) deine Inputs (Daten), 2) das Output-Format (z.B. CSV/JSON/Tabelle), 3) Quality-Checks (Pruefung am Ende).' },
      {
        kind: 'steps',
        title: 'So gehst du vor (immer gleich)',
        items: [
          'Agenten-Seite oeffnen und den passenden Agenten auswaehlen.',
          'Rechts „Input Format“ lesen und deine Daten genau so strukturieren (Stichpunkte reichen).',
          'Darunter „Output Format“ als Ziel setzen: das Format im Prompt nochmal explizit wiederholen.',
          'Wenn du Dateien/Datenlisten hast: erst sauber als Liste oder Tabelle reinkopieren (nicht als Fliesstext).',
          'Zum Schluss: „Bitte gib mir eine Checkliste, ob etwas fehlt.“',
        ],
      },
      {
        kind: 'example',
        title: 'Use Case: CRM-Leads bereinigen (Output als CSV)',
        text: [
          'ZIEL: Bereinige und normalisiere diese Leads fuer mein CRM.',
          'INPUT (CSV-Auszug):',
          'name,email,company,notes',
          'Max Mustermann,max@beispiel.at,Beispiel GmbH,\"interessiert, Rueckruf\"',
          '',
          'OUTPUT:',
          '- Liefere eine CSV mit Spalten: name,email,company,industry,priority,next_step',
          '- Setze priority als: low|medium|high',
          '- next_step als 1 Satz',
          '',
          'QUALITY CHECK:',
          '- Liste fehlende Daten (wenn vorhanden) und Vorschlaege, wie ich sie sammle.',
        ].join('\n'),
      },
      {
        kind: 'example',
        title: 'Use Case: Automations-Plan (Output als Tabelle)',
        text: [
          'ZIEL: Baue mir einen Automations-Plan fuer Top-up Kunden-Onboarding.',
          'KONTEXT:',
          '- Produkt: KitzChat Wallet/Top-up',
          '- Ziel: Aktivierung innerhalb 24h',
          '',
          'OUTPUT:',
          '- Tabelle: Trigger | Bedingung | Aktion | Kanal | Text | Messpunkt',
          '- Danach: 5 A/B Varianten fuer den ersten Touchpoint.',
        ].join('\n'),
      },
      { kind: 'note', text: 'Wenn du Hilfe brauchst: Support hilft dir beim richtigen Input/Output fuer deinen Agenten und deinen Use Case.' },
      { kind: 'links', items: [{ label: 'Agenten', href: '/agents', note: 'Input/Output direkt im Agent-Panel sichtbar' }, { label: 'Support', href: '/support-chat', note: 'Setup-Hilfe anfordern' }] },
    ],
  },
  {
    slug: 'wallet-topup',
    title: 'Wallet / Top-up (Tokens & Guthaben)',
    category: 'Abrechnung',
    icon: CreditCard,
    summary: 'Wie Top-ups funktionieren, was „Guthaben“ bedeutet und wo du alles findest.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'KitzChat nutzt ein Wallet-/Top‑up‑Modell: Du lädst Guthaben auf und verbrauchst Tokens über die Nutzung. Stripe Zahlungen erzeugen dabei automatisch einen Stripe‑Kunden und verknüpfen ihn mit deinem App‑Konto.' },
      {
        kind: 'steps',
        title: 'Top-up durchführen',
        items: [
          'Öffne „Guthaben / Tokens“.',
          'Wähle ein Top‑up (oder Gutschein/Voucher, falls verfügbar).',
          'Bezahlen in Stripe → danach kehrst du automatisch zurück.',
          'Prüfe, ob dein Zugriff/Agenten freigeschaltet sind.',
        ],
      },
      {
        kind: 'links',
        items: [{ label: 'Guthaben / Tokens', href: '/usage-token', note: 'Nutzung, Top‑ups, Rechnungen' }],
      },
      { kind: 'note', text: 'Wenn nach Zahlung nichts passiert: Seite neu laden, 1–2 Minuten warten; bei Bedarf Support kontaktieren.' },
    ],
  },
  {
    slug: 'usage-tokens',
    title: 'Token Usage (Uebersicht & Tabelle)',
    category: 'Abrechnung',
    icon: CreditCard,
    summary: 'Transparenz: Tokens & Kosten pro Tag und pro Agent.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'Hier siehst du eine Uebersicht deiner Token-Nutzung. Als Kunde ist die Tabelle automatisch auf dein Konto gefiltert. Als Admin siehst du die Gesamtuebersicht.' },
      { kind: 'usage_table', days: 14 },
      { kind: 'note', text: 'Tipp: Wenn die Zahlen unerwartet sind, pruefe zuerst, ob ein Agent sehr lange Outputs erzeugt (z.B. Tabellen/Listen). Dann Input/Output strikter machen.' },
      { kind: 'links', items: [{ label: 'Guthaben / Tokens', href: '/usage-token', note: 'Top-ups und aktuellem Kontostand' }, { label: 'Support', href: '/support-chat', note: 'Fragen zur Nutzung? Support hilft.' }] },
    ],
  },
  {
    slug: 'settings-customer',
    title: 'Einstellungen (Kundenbereich)',
    category: 'Konto',
    icon: Settings,
    summary: 'Konto, Passwörter, Preferences und Support – alles an einem Ort.',
    audience: 'customer',
    sections: [
      { kind: 'p', text: 'Im Kundenbereich sind die Einstellungen dein Kontrollzentrum: Profil, Hilfe, Support, Benachrichtigungen und (je nach Paket) Integrationen.' },
      {
        kind: 'steps',
        title: 'Empfohlene Basiskonfiguration',
        items: [
          'Passwort setzen/ändern und sicher speichern.',
          'Support-Chat testen (kurze Nachricht senden).',
          'Akzeptierte Nutzungsbedingungen prüfen.',
          'Bei Bedarf: Preferences aktualisieren (z.B. Benachrichtigungen).',
        ],
      },
      { kind: 'links', items: [{ label: 'Einstellungen', href: '/settings' }, { label: 'Support Chat', href: '/support-chat', note: 'Direkter Draht' }] },
    ],
  },
  {
    slug: 'downloads',
    title: 'Downloads: CSV Vorlagen',
    category: 'Downloads',
    icon: Search,
    summary: 'Fertige CSV-Templates fuer Agenten, Automationen und Datenbanken.',
    audience: 'customer',
    sections: [
      { kind: 'p', text: 'Im Kundenbereich findest du unter „Downloads“ vorgefertigte CSV-Dateien. Diese helfen dir, Daten sauber zu strukturieren (CRM, Automationen, Import/Export, DB-Pflege).' },
      {
        kind: 'steps',
        title: 'So nutzt du die Vorlagen',
        items: [
          'Downloads oeffnen und eine Vorlage als Card auswaehlen.',
          'Card anklicken → Popup oeffnet sich.',
          '„CSV herunterladen“ klicken und Datei lokal speichern.',
          'CSV in Excel/Numbers/Google Sheets bearbeiten oder direkt in Tools importieren.',
          'Wenn du unsicher bist: Agent „Meister“ bitten, die CSV fuer deinen Use Case anzupassen.',
        ],
      },
      { kind: 'links', items: [{ label: 'Downloads', href: '/downloads', note: 'CSV Templates als Cards' }, { label: 'Agenten', href: '/agents', note: 'CSV fuellen lassen (Input/Output)' }] },
      { kind: 'note', text: 'Support hilft dir beim korrekten Import/Export und bei der passenden Vorlage.' },
    ],
  },
  {
    slug: 'security-privacy',
    title: 'Datenschutz & Sicherheit',
    category: 'Sicherheit',
    icon: Shield,
    summary: 'Was gespeichert wird, wie Sessions funktionieren und worauf du achten solltest.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'KitzChat ist „secure by default“: Auth‑Sessions, getrennte Rollen und geschützte Admin‑Bereiche. Datenschutzseiten sind im Footer verlinkt.' },
      {
        kind: 'steps',
        title: 'Sicher arbeiten',
        items: [
          'Teile keine Passwörter oder API Keys in Chats.',
          'Nutze starke Passwörter und 2FA im E‑Mail‑Postfach.',
          'Bei Zugriffsproblemen: erst aus-/einloggen, dann Support kontaktieren.',
        ],
      },
      { kind: 'links', items: [{ label: 'Datenschutz', href: '/datenschutz' }, { label: 'Nutzungshinweise', href: '/nutzungshinweise' }] },
    ],
  },
  {
    slug: 'support',
    title: 'Support & Troubleshooting',
    category: 'Support',
    icon: MessageSquareText,
    summary: 'Wenn etwas nicht klappt: Diagnose, Infos sammeln, Support schnell helfen lassen.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'Wenn du Hilfe brauchst: Support hilft dir. Je genauer du den Fehler beschreibst, desto schneller ist er geloest. Ideal: Screenshot + Schrittfolge + Uhrzeit.' },
      {
        kind: 'steps',
        title: 'Schnelle Selbsthilfe',
        items: [
          'Browser neu laden (Hard Refresh).',
          'Ausloggen → Einloggen.',
          'Prüfen ob Guthaben vorhanden ist (Top‑up Seite).',
          'Wenn Stripe: prüfen ob Zahlung abgeschlossen wurde.',
        ],
      },
      {
        kind: 'links',
        items: [
          { label: 'Support Chat', href: '/support-chat', note: 'Schnellster Weg' },
          { label: 'Hilfe', href: '/hilfe', note: 'Anleitungen & Beispiele' },
        ],
      },
    ],
  },
  {
    slug: 'search-inside',
    title: 'Suchen & Navigation',
    category: 'Basics',
    icon: Search,
    summary: 'So findest du Inhalte, Einstellungen und Agenten schnell wieder.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'Nutze die Suche in der Hilfe für Begriffe (z.B. „Guthaben“, „Agent“, „Passwort“). Im Dashboard navigierst du über das Menü links (Desktop) bzw. unten (Mobile).' },
      {
        kind: 'steps',
        items: [
          'Auf Mobile: Bottom‑Navigation nutzen.',
          'Auf Desktop: Navigation links + Header oben.',
          'Bei langen Seiten: Suche nutzen und Kategorien öffnen.',
        ],
      },
    ],
  },
  {
    slug: 'admin-overview',
    title: 'Admin-Bereich (Überblick)',
    category: 'Admin',
    icon: Users,
    summary: 'Rollen, Einstellungen, Abrechnung, E-Mail und Betrieb – aus Admin-Sicht.',
    audience: 'admin',
    sections: [
      { kind: 'p', text: 'Als Admin steuerst du Nutzer, Rollen, Stripe/Wallet, E‑Mail (SMTP), System-Settings und Reporting.' },
      {
        kind: 'steps',
        title: 'Admin-Workflow',
        items: [
          'E-Mail/SMTP prüfen → Testmail senden.',
          'Wallet/Stripe prüfen (Produkte/Kunden/Events).',
          'Rollen & Berechtigungen prüfen (RBAC).',
          'Schema/DB Status prüfen.',
        ],
      },
      { kind: 'note', text: 'Wenn du Admin-Änderungen vornimmst: immer danach kurz die relevanten Seiten neu laden und einen Testflow durchführen.' },
    ],
  },
  {
    slug: 'operations',
    title: 'Betrieb & Fehlerdiagnose (Basics)',
    category: 'Admin',
    icon: Wrench,
    summary: 'Wenn etwas in Produktion hakt: was du prüfen kannst (ohne Dev-Wissen).',
    audience: 'admin',
    sections: [
      { kind: 'p', text: 'Für schnelle Diagnose: ist die Seite erreichbar, sind Mails konfiguriert, kommen Webhooks an, sind DB-Migrationen sauber?' },
      {
        kind: 'steps',
        items: [
          'Login erreichbar? Wenn nein: Server/Proxy prüfen.',
          'E-Mail: Transport prüfen + Testmail senden.',
          'Stripe: Events/Webhooks prüfen.',
          'DB: Schema Status prüfen (Migrationen).',
        ],
      },
    ],
  },
  {
    slug: 'write-better',
    title: 'Schreibweise für Business-Outputs',
    category: 'Agenten',
    icon: BookOpenText,
    summary: 'Vorlagen, Tonalität und Output-Checks für „ultra business“ Ergebnisse.',
    audience: 'both',
    sections: [
      { kind: 'p', text: 'Wenn du highclass Ergebnisse willst: gib Zielgruppe, Tonalität, Format und Constraints klar vor.' },
      {
        kind: 'example',
        title: 'Business-Template',
        text: 'Bitte antworte als Senior Consultant. Output: Executive Summary (max 120 Wörter), danach Plan in 3 Phasen, dann Risiken & offene Fragen. Sprache: Deutsch. Stil: präzise, ohne Füllwörter.',
      },
      {
        kind: 'steps',
        title: 'Qualität sichern',
        items: [
          'Lass Annahmen explizit auflisten.',
          'Verlange eine Checkliste zur Umsetzung.',
          'Bitte um konkrete Beispiele (1–2) statt Theorie.',
        ],
      },
    ],
  },
];

export const HELP_CATEGORIES = Array.from(new Set(HELP_ARTICLES.map((a) => a.category))).sort((a, b) => a.localeCompare(b));
