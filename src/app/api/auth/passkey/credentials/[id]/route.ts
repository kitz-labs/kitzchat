import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { deletePasskeyForUser } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const passkeyId = Number(id);
    if (!Number.isFinite(passkeyId) || passkeyId <= 0) {
      return NextResponse.json({ error: 'Invalid passkey id' }, { status: 400 });
    }
    const ok = deletePasskeyForUser(user.id, passkeyId);
    if (!ok) return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete passkey';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to delete passkey' }, { status: 500 });
  }
}

