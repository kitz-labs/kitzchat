'use client';

import { ChatKit, useChatKit } from '@openai/chatkit-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

async function fetchClientSecret(endpoint: string): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = (await res.json().catch(() => ({}))) as { client_secret?: string; error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `chatkit_session_failed:${res.status}`);
  }
  if (!payload.client_secret) {
    throw new Error('chatkit_client_secret_missing');
  }
  return payload.client_secret;
}

export function CustomerChat() {
  const { ready } = useAudienceGuard({
    redirectAdminTo: '/internal/chat',
    redirectOnErrorTo: '/login',
  });

  const { control } = useChatKit({
    api: {
      async getClientSecret(_existing) {
        // Refresh strategy: request a fresh session token from our server endpoint.
        return fetchClientSecret('/api/chatkit/customer/session');
      },
    },
  });

  if (!ready) {
    return <div className="min-h-[50vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  return (
    <ChatKit
      control={control}
      className="h-[70vh] min-h-[560px] w-full rounded-3xl border bg-background/70 backdrop-blur"
    />
  );
}

export default CustomerChat;

