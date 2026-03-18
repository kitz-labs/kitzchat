import Link from 'next/link';

export default function AcceptTermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Nutzungshinweise</h1>
        <p className="text-sm text-muted-foreground">Bitte lies Nutzungshinweise und Datenschutz. Die Bestaetigung erfolgt im Kunden-Onboarding.</p>
      </div>

      <div className="panel">
        <div className="panel-body space-y-4 text-sm text-muted-foreground">
          <p>Neue Aktivierungen und das erstmalige Onboarding setzen die Bestaetigung dieser Hinweise voraus. Bereits aktive Konten behalten ihren Zugang.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/nutzungshinweise" className="rounded-full border border-border/60 px-3 py-1 hover:text-foreground">Nutzungshinweise</Link>
            <Link href="/datenschutz" className="rounded-full border border-border/60 px-3 py-1 hover:text-foreground">Datenschutz</Link>
            <Link href="/usage-token?onboarding=1" className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-primary hover:text-primary">Zum Onboarding</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
