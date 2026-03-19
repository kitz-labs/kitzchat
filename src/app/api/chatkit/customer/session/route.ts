import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createChatKitClientSecret } from '@/lib/chatkit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const workflowId = (process.env.OPENAI_CHATKIT_CUSTOMER_WORKFLOW_ID || '').trim();
    if (!workflowId) {
      return NextResponse.json({ error: 'ChatKit customer workflow is not configured' }, { status: 503 });
    }

    const { clientSecret } = await createChatKitClientSecret({
      workflowId,
      user: `customer:${user.id}`,
      expiresAfterSeconds: 60 * 20,
      maxRequestsPerMinute: 30,
      maxRequestsPerSession: 200,
      metadata: {
        audience: 'customer',
        user_id: String(user.id),
        username: (user.username || '').trim(),
      },
    });

    return NextResponse.json({ client_secret: clientSecret });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create ChatKit session';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'openai_api_key_missing') return NextResponse.json({ error: 'OpenAI is not configured' }, { status: 503 });
    if (message === 'chatkit_workflow_missing') return NextResponse.json({ error: 'ChatKit customer workflow is not configured' }, { status: 503 });
    return NextResponse.json({ error: message || 'Failed to create ChatKit session' }, { status: 500 });
  }
}
