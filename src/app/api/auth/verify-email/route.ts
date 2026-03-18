import { NextResponse } from 'next/server';
import { seedAdmin, verifyEmailWithToken } from '@/lib/auth';
import { getAuthLinkBaseUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = getAuthLinkBaseUrl(request);
  try {
    seedAdmin();
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
    const userAgent = request.headers.get('user-agent') || null;
    verifyEmailWithToken({ token, ip, userAgent });
    return NextResponse.redirect(new URL('/login?verified=1', origin));
  } catch {
    return NextResponse.redirect(new URL('/login?error=Verifizierung%20fehlgeschlagen', origin));
  }
}
