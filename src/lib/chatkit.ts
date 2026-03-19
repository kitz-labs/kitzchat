type ChatKitSessionCreateParams = {
  workflowId: string;
  user: string;
  // Hard limits as defense-in-depth (ChatKit backend still enforces its own).
  maxRequestsPerMinute?: number;
  maxRequestsPerSession?: number;
  expiresAfterSeconds?: number;
  metadata?: Record<string, string>;
};

type ChatKitSessionCreateResponse = {
  client_secret?: string;
  id?: string;
  error?: unknown;
};

function pickEnv(name: string): string | null {
  const v = (process.env[name] || '').trim();
  return v ? v : null;
}

export async function createChatKitClientSecret(params: ChatKitSessionCreateParams): Promise<{ clientSecret: string; sessionId: string | null }> {
  const apiKey = pickEnv('OPENAI_API_KEY') || pickEnv('OPENAI_ADMIN_KEY');
  if (!apiKey) throw new Error('openai_api_key_missing');
  if (!params.workflowId.trim()) throw new Error('chatkit_workflow_missing');
  if (!params.user.trim()) throw new Error('chatkit_user_missing');

  const orgId = pickEnv('OPENAI_ORG_ID');
  const project = pickEnv('OPENAI_PROJECT');

  const body = {
    workflow: { id: params.workflowId.trim() },
    user: params.user.trim(),
    ...(params.metadata ? { metadata: params.metadata } : {}),
    ...(Number.isFinite(params.expiresAfterSeconds) ? { expires_after: Math.max(60, Math.round(params.expiresAfterSeconds!)) } : {}),
    ...(Number.isFinite(params.maxRequestsPerMinute) ? { max_requests_per_1_minute: Math.max(1, Math.round(params.maxRequestsPerMinute!)) } : {}),
    ...(Number.isFinite(params.maxRequestsPerSession) ? { max_requests_per_session: Math.max(1, Math.round(params.maxRequestsPerSession!)) } : {}),
  };

  const response = await fetch('https://api.openai.com/v1/chatkit/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'chatkit_beta=v1',
      Authorization: `Bearer ${apiKey}`,
      ...(orgId ? { 'OpenAI-Organization': orgId } : {}),
      ...(project ? { 'OpenAI-Project': project } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  let payload: ChatKitSessionCreateResponse | null = null;
  try {
    payload = (await response.json()) as ChatKitSessionCreateResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof (payload as any)?.error?.message === 'string' ? (payload as any).error.message : `chatkit_session_failed:${response.status}`;
    // Never include secrets; message is safe / from OpenAI API.
    throw new Error(message);
  }

  const clientSecret = typeof payload?.client_secret === 'string' ? payload.client_secret : '';
  if (!clientSecret) throw new Error('chatkit_client_secret_missing');

  const sessionId = typeof payload?.id === 'string' ? payload.id : null;
  return { clientSecret, sessionId };
}

