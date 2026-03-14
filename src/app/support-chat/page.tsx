import { CustomerSupportPanel } from '@/components/customer/customer-support-panel';

export default function SupportChatPage() {
  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Support</h1>
        <p className="text-xs text-muted-foreground">Direkter Chat mit dem Support-Team fuer Fragen, Stoerungen und Rueckmeldungen.</p>
      </div>
      <CustomerSupportPanel />
    </div>
  );
}