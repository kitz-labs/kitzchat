import Script from 'next/script';
import InternalChat from '@/components/chat/InternalChat';

export default function InternalChatPage() {
  return (
    <>
      <Script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" strategy="afterInteractive" />
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Internal Chat</h1>
          <p className="text-sm text-muted-foreground">
            ChatKit surface for staff and admins. This is additive and does not replace existing agents.
          </p>
        </div>
        <InternalChat />
      </div>
    </>
  );
}

