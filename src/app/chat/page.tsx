import Script from 'next/script';
import CustomerChat from '@/components/chat/CustomerChat';

export default function CustomerChatPage() {
  return (
    <>
      <Script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" strategy="afterInteractive" />
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Customer-facing ChatKit surface. This is additive and does not replace existing agents.
          </p>
        </div>
        <CustomerChat />
      </div>
    </>
  );
}

