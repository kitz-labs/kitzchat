import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getAppStateDir } from '@/lib/app-state';

export const dynamic = 'force-dynamic';

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'upload';
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request as Request);
    const data = await request.formData();
    const file = data.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Datei erforderlich' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadsDir = path.join(getAppStateDir(), 'uploads', String(user.id));
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = sanitizeFilename(file.name || 'upload');
    const storedName = `${Date.now()}-${safeName}`;
    const absolutePath = path.join(uploadsDir, storedName);
    await fs.writeFile(absolutePath, buffer);

    const result = getDb()
      .prepare('INSERT INTO chat_uploads (user_id, original_name, mime_type, size_bytes, storage_path) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, file.name || safeName, file.type || 'application/octet-stream', buffer.byteLength, absolutePath);

    return NextResponse.json({
      upload: {
        id: Number(result.lastInsertRowid),
        name: file.name || safeName,
        type: file.type || 'application/octet-stream',
        size: buffer.byteLength,
        url: `/api/chat/uploads/${String(result.lastInsertRowid)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
