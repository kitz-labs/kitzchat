import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sendTelegramAlert } from '@/lib/alerts';
import { readSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    const enabled = settings.telegram?.enabled ?? true;
    const token = (settings.telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (settings.telegram?.chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();
    return NextResponse.json({
      configured: Boolean(enabled && token && chatId),
      enabled,
      has_bot_token: Boolean(token),
      has_chat_id: Boolean(chatId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load telegram status';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load telegram status' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = requireAdmin(request);
    const result = await sendTelegramAlert(`KitzChat Telegram-Test\nAdmin: ${admin.username}\nZeit: ${new Date().toISOString()}`);
    if (!result.ok) {
      return NextResponse.json({ error: result.detail || 'Telegram test failed' }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send telegram test';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to send telegram test' }, { status: 500 });
  }
}
