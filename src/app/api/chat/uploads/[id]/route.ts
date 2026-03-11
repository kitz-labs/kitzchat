import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const uploadId = Number(id);
    if (!Number.isInteger(uploadId) || uploadId <= 0) {
      return NextResponse.json({ error: 'Invalid upload id' }, { status: 400 });
    }

    const row = getDb()
      .prepare('SELECT user_id, original_name, mime_type, storage_path FROM chat_uploads WHERE id = ?')
      .get(uploadId) as { user_id: number; original_name: string; mime_type: string | null; storage_path: string } | undefined;

    if (!row || (user.role !== 'admin' && row.user_id !== user.id)) {
      return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 });
    }

    const file = await fs.readFile(row.storage_path);
    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${row.original_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read upload';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to read upload' }, { status: 500 });
  }
}