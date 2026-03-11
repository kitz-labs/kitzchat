const POLICY_LINKS = [
  {
    label: 'OpenAI Nutzungsrichtlinien',
    href: 'https://openai.com/de-DE/policies/usage-policies/',
  },
  {
    label: 'OpenAI Nutzungsbedingungen',
    href: 'https://openai.com/de-DE/policies/row-terms-of-use/',
  },
  {
    label: 'OpenAI Sicherheit und Datenschutz',
    href: 'https://openai.com/de-DE/security-and-privacy/',
  },
];

const ALLOWED_USE = [
  'Produktive, sachliche und legale Nutzung der KI-Funktionen im eigenen Geschaefts- oder Arbeitskontext.',
  'Erstellung, Analyse und Ueberarbeitung von Texten, Ideen, Prozessen und allgemeinen Arbeitsablaeufen.',
  'Nutzung der Agenten nur im Rahmen der in KitzChat vorgesehenen Funktionen und mit wahrheitsgemaessen Eingaben.',
  'Verwendung von Ausgaben nur nach eigener menschlicher Pruefung auf Richtigkeit, Eignung und Rechtskonformitaet.',
];

const FORBIDDEN_USE = [
  'Kriminelle Suchanfragen, Anleitungen zu Straftaten, Betrug, Hacking, Malware, Diebstahl, Gewalt oder Umgehung von Schutzmechanismen.',
  'Anfragen mit Gefahr fuer Mensch, Tier oder Leben sowie Aufforderungen zu Verletzung, Vergiftung, Terror, Brandstiftung oder Waffenbezug.',
  'Verletzung fremder Rechte, Missbrauch personenbezogener Daten, Profiling ohne Einwilligung oder Offenlegung privater Informationen.',
  'Irrefuehrende, beleidigende, diskriminierende, sexualisierte oder sonst missbraeuchliche Inhalte.',
  'Einsatz der Ausgaben als alleinige Grundlage fuer wichtige medizinische, rechtliche, finanzielle, versicherungsbezogene oder personelle Entscheidungen.',
  'Umgehung technischer, vertraglicher oder sicherheitsbezogener Beschraenkungen der Plattform.',
];

const ENFORCEMENT = [
  'Verstoesse gegen diese Richtlinien koennen sofort zur Sperrung oder Einschraenkung des Accounts fuehren.',
  'Bei schweren oder wiederholten Verstoessen kann vorhandenes Guthaben einbehalten werden.',
  'Kriminelle Anfragen werden nicht beantwortet. Bei weiterer krimineller Nutzung wird der Account gesperrt.',
  'Eine Entsperrung ist ausschliesslich nach Pruefung durch den Support moeglich. Anfrage an office@aikitz.at.',
  'Bei Gefahr fuer Mensch, Tier oder Leben behalten wir uns vor, den Fall an die naechstzustaendige Behoerde zu melden.',
  'Bei Richtlinienverstoessen oder Gefahr in Verzug wird intern zuerst eine Warnung an die Geschaeftsleitung ausgelost.',
];

const ACCOUNT_RULES = [
  'Sie muessen wahrheitsgemaesse Konto- und Zahlungsdaten hinterlegen und Ihre Zugangsdaten vertraulich behandeln.',
  'Sie sind fuer alle Aktivitaeten verantwortlich, die ueber Ihr Konto erfolgen.',
  'KI-Ausgaben koennen fehlerhaft, unvollstaendig oder unpassend sein und muessen vor Verwendung geprueft werden.',
  'KitzChat kann Funktionen, Richtlinien und Preise aus Sicherheits-, Rechts- oder Betriebsgruenden anpassen.',
];

export default function NutzungshinweisePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Nutzungshinweise und Nutzungsbedingungen</h1>
        <p className="text-sm text-muted-foreground">
          Diese Seite beschreibt die verbindlichen Regeln fuer die Nutzung von KitzChat. Die Inhalte wurden inhaltlich an den Sicherheits-, Nutzungs- und Datenschutzprinzipien von OpenAI ausgerichtet und fuer KitzChat in eigener Form formuliert.
        </p>
      </div>

      <section className="panel">
        <div className="panel-body space-y-3 text-sm text-muted-foreground">
          <div className="text-sm font-semibold text-foreground">Rechtsgrundlage und Bezug</div>
          <p>
            Fuer die Nutzung von KitzChat gelten diese projektspezifischen Regeln in Verbindung mit geltendem Recht. Die inhaltliche Ausrichtung orientiert sich an den Sicherheits- und Missbrauchsgrundsaetzen von OpenAI. Es handelt sich hier nicht um eine wortgleiche Uebernahme externer Dokumente, sondern um eigene Nutzungsbedingungen fuer KitzChat.
          </p>
          <div className="flex flex-wrap gap-2">
            {POLICY_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="rounded-full border border-border/60 px-3 py-1 text-xs hover:text-foreground transition-colors">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel">
          <div className="panel-body space-y-3">
            <h2 className="text-sm font-semibold">Erlaubte Nutzung</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {ALLOWED_USE.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </article>

        <article className="panel border-destructive/25">
          <div className="panel-body space-y-3">
            <h2 className="text-sm font-semibold">Verbotene Nutzung</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {FORBIDDEN_USE.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-body space-y-3">
          <h2 className="text-sm font-semibold">Kontopflichten und Verantwortung</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {ACCOUNT_RULES.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      </section>

      <section className="panel border-warning/30">
        <div className="panel-body space-y-3">
          <h2 className="text-sm font-semibold">Durchsetzung, Sperrung und Guthaben</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {ENFORCEMENT.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            Support fuer Einsprueche und Entsperrungsanfragen: office@aikitz.at
          </div>
        </div>
      </section>
    </div>
  );
}