import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppStateDir } from '@/lib/app-state';

export const runtime = 'nodejs';

function contentTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function isSafeSegment(seg: string): boolean {
  if (!seg) return false;
  if (seg === '.' || seg === '..') return false;
  if (seg.includes('/') || seg.includes('\\')) return false;
  return true;
}

export async function GET(_request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const params = await ctx.params;
  const parts = Array.isArray(params.path) ? params.path : [];
  if (!parts.length || parts.some((p) => !isSafeSegment(p))) {
    return new Response('Not found', { status: 404 });
  }

  const baseDir = path.join(getAppStateDir(), 'email-assets');
  const resolvedBase = path.resolve(baseDir);
  const filePath = path.resolve(path.join(baseDir, ...parts));
  if (!filePath.startsWith(resolvedBase + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    const buf = await fs.readFile(filePath);
    const filename = parts[parts.length - 1] || 'asset';
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': contentTypeForFilename(filename),
        'cache-control': 'public, max-age=3600',
        'content-disposition': `inline; filename="${filename.replaceAll('"', '')}"`,
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

