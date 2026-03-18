import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppStateDir } from '@/lib/app-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const filePath = path.join(getAppStateDir(), 'branding', 'icon.png');
  try {
    const buf = await fs.readFile(filePath);
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=60, stale-while-revalidate=3600',
        'content-disposition': 'inline; filename="icon.png"',
      },
    });
  } catch {
    return new Response(null, { status: 307, headers: { location: '/kitzchat.png' } });
  }
}
