import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getUserById } from '@/lib/auth';
import { listCustomerMemoryFiles, readCustomerMemoryFile } from '@/lib/customer-memory';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request as unknown as Request);
    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const file = request.nextUrl.searchParams.get('file');
    if (file) {
      const payload = await readCustomerMemoryFile(userId, user.username, file);
      return NextResponse.json(payload);
    }

    const payload = await listCustomerMemoryFiles(userId, user.username);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load customer memory';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (message === 'invalid_file' || message === 'file_required') return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to load customer memory' }, { status: 500 });
  }
}

