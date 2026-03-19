import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createChatKitClientSecret } from '@/lib/chatkit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = requireAdmin(request);
    const workflowId = (process.env.OPENAI_CHATKIT_INTERNAL_WORKFLOW_ID || '').trim();
    if (!workflowId) {
      return NextResponse.json({ error: 'ChatKit internal workflow is not configured' }, { status: 503 });
    }

    const { clientSecret } = await createChatKitClientSecret({
      workflowId,
      user: `staff:${user.id}`,
      expiresAfterSeconds: 60 * 30,
      maxRequestsPerMinute: 120,
      maxRequestsPerSession: 1000,
      metadata: {
        audience: 'internal',
        user_id: String(user.id),
        username: (user.username || '').trim(),
        role: (user.role || '').trim(),
      },
    });

    return NextResponse.json({ client_secret: clientSecret });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create ChatKit session';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (message === 'openai_api_key_missing') return NextResponse.json({ error: 'OpenAI is not configured' }, { status: 503 });
    if (message === 'chatkit_workflow_missing') return NextResponse.json({ error: 'ChatKit internal workflow is not configured' }, { status: 503 });
    return NextResponse.json({ error: message || 'Failed to create ChatKit session' }, { status: 500 });
  }
}
