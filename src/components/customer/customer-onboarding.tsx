'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Coins, MessageSquareText, Sparkles } from 'lucide-react';
import { PaymentCTA } from './payment-cta';

type CustomerOnboardingProps = {
  hasAccess: boolean;
  onboardingCompleted: boolean;
  walletBalanceCents: number;
  onFinish: () => Promise<void> | void;
};

const STEPS = [
  {
    title: 'Willkommen bei KitzChat',
    description: 'Hier richtest du deinen Kundenbereich Schritt für Schritt ein, bis deine erste Einzahlung abgeschlossen ist.',
    icon: Sparkles,
  },
  {
    title: 'So funktioniert dein Guthaben',
    description: 'Mit der Aktivierung schaltest du alle Agenten frei. Danach kannst du Guthaben direkt in KitzChat nachladen. Nach deiner ersten erfolgreichen Einzahlung wird automatisch ein 30 %-Rabatt fuer die naechste Einzahlung vorbereitet.',
    icon: Coins,
  },
  {
    title: 'Bereit für die erste Einzahlung',
    description: 'Starte jetzt deine erste Zahlung. Danach kannst du Webchat und Agenten direkt verwenden.',
    icon: MessageSquareText,
  },
];

export function CustomerOnboarding({ hasAccess, onboardingCompleted, walletBalanceCents, onFinish }: CustomerOnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);

  if (onboardingCompleted) {
    return null;
  }

  const current = STEPS[stepIndex];
  const Icon = current.icon;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="text-sm font-medium">Onboarding</h2>
          <p className="text-xs text-muted-foreground">Schritt {stepIndex + 1} von {STEPS.length}</p>
        </div>
      </div>
      <div className="panel-body space-y-5">
        <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/10 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon size={22} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{current.title}</h3>
            <p className="text-sm text-muted-foreground">{current.description}</p>
            {hasAccess ? <div className="text-xs text-success">Aktivierung erkannt. Aktuelles Guthaben: €{(walletBalanceCents / 100).toFixed(2)}</div> : null}
            {!hasAccess && stepIndex === 2 ? <div className="text-xs text-primary">Nach deiner ersten erfolgreichen Zahlung steht dein 30 %-Folgerabatt fuer die naechste Einzahlung automatisch bereit.</div> : null}
          </div>
        </div>

        <div className="flex gap-2">
          {STEPS.map((step, index) => (
            <div key={step.title} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-border/60'}`} />
          ))}
        </div>

        {!isLastStep ? (
          <button type="button" onClick={() => setStepIndex((value) => Math.min(value + 1, STEPS.length - 1))} className="btn btn-primary text-sm inline-flex items-center gap-2">
            Weiter <ArrowRight size={14} />
          </button>
        ) : !hasAccess ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Stripe öffnet sich in einem neuen Tab. Diese Seite bleibt offen und aktualisiert dein Konto nach der erfolgreichen Zahlung.</p>
            <PaymentCTA label="Erste Einzahlung starten" returnPath="/usage-token" />
          </div>
        ) : (
          <button type="button" onClick={() => void onFinish()} className="btn btn-primary text-sm inline-flex items-center gap-2">
            <CheckCircle2 size={14} /> Onboarding abschließen
          </button>
        )}
      </div>
    </div>
  );
}