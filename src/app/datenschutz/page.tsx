const PRIVACY_POINTS = [
  'Wir sehen keine privaten Inhalte aktiv mit. KitzChat ist darauf ausgelegt, Kundendaten nur fuer den technischen Betrieb und die Bereitstellung der Funktionen zu verarbeiten.',
  'Private Angaben, Kontodaten, Uploads und Integrationsdaten werden nicht fuer fremde Zwecke verkauft oder weitergegeben.',
  'Wir greifen nicht ohne Anlass manuell in private Kundendaten ein. Zugriff erfolgt nur, wenn dies fuer Support, Sicherheit, Missbrauchspruefung oder gesetzliche Pflichten erforderlich ist.',
  'Bei Missbrauch, akuter Gefahr oder rechtlicher Verpflichtung koennen relevante Daten gesichert, geprueft und an zustaendige Stellen weitergegeben werden.',
  'Sie sollten keine besonders sensiblen Daten eingeben, wenn deren Verarbeitung fuer Ihren Anwendungsfall nicht notwendig ist.',
];

const BUSINESS_POINTS = [
  'KitzChat wird von AI Kitz Art & Labs als eingetragenes Unternehmen betrieben.',
  'Wir verarbeiten nur die Daten, die fuer Konto, Abrechnung, Support, Uploads, Integrationen und den technischen Betrieb der Webapp erforderlich sind.',
  'Sicherheits- und Betriebsprotokolle koennen gespeichert werden, um Missbrauch zu verhindern, Fehler zu analysieren und den Dienst zu schuetzen.',
  'Wenn Sie Fragen zu Datenschutz, Konto oder Datenverarbeitung haben, kontaktieren Sie uns unter ceo@aikitz.at.',
];

export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Datenschutz</h1>
        <p className="text-sm text-muted-foreground">
          Diese Datenschutzhinweise erklaeren in knapper Form, wie KitzChat mit Kunden- und Systemdaten umgeht.
        </p>
      </div>

      <section className="panel">
        <div className="panel-body space-y-3 text-sm text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">Was wir sehen und was nicht</h2>
          <ul className="space-y-2">
            {PRIVACY_POINTS.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body space-y-3 text-sm text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">Unternehmen und Kontakt</h2>
          <ul className="space-y-2">
            {BUSINESS_POINTS.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm">
            Datenschutzfragen: ceo@aikitz.at
          </div>
        </div>
      </section>
    </div>
  );
}
