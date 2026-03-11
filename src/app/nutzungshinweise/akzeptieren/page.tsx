import Link from 'next/link';

export default function AcceptTermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Nutzungshinweise</h1>
        <p className="text-sm text-muted-foreground">Die rechtlichen Informationen stehen hier nur zur Einsicht bereit und muessen nicht bestaetigt werden.</p>
      </div>

      <div className="panel">
        <div className="panel-body space-y-4 text-sm text-muted-foreground">
          <p>Die Seiten Nutzungshinweise und Datenschutz sind jederzeit ueber den Footer erreichbar. Dein Kundenzugang wird dadurch nicht blockiert.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/nutzungshinweise" className="rounded-full border border-border/60 px-3 py-1 hover:text-foreground">Nutzungshinweise</Link>
            <Link href="/datenschutz" className="rounded-full border border-border/60 px-3 py-1 hover:text-foreground">Datenschutz</Link>
          </div>
        </div>
      </div>
    </div>
  );
}