import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';
import { testWebDav } from '@/lib/webdav';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = requireApiUser(request);
  if (auth) return auth;

  try {
    const user = requireUser(request);
    const preferences = ensureCustomerPreferences(user.id);

    const baseUrl = (preferences.cloud_login_url || '').trim();
    const username = (preferences.cloud_username || '').trim();
    const password = (preferences.cloud_password || '').trim();
    const folder = (preferences.cloud_folder || preferences.docu_root_path || '').trim();

    if (!baseUrl || !username || !password) {
      return NextResponse.json({ ok: false, error: 'Cloud Login, Benutzername und Passwort sind erforderlich.' }, { status: 400 });
    }

    const result = await testWebDav({ baseUrl, username, password, folder });
    if (result.hint === 'folder_link_is_share_url') {
      return NextResponse.json({
        ok: false,
        error: 'Der Ordner-Link ist ein Share-Link (index.php/f/...). Bitte gib eine WebDAV Ordner-URL oder einen Pfad an.',
        result,
      });
    }

    return NextResponse.json({ ok: result.ok, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('POST /api/customer/cloud/test error:', error);
    return NextResponse.json({ ok: false, error: message.slice(0, 240) }, { status: 500 });
  }
}

