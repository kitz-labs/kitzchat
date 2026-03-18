import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readSettings, writeSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v : null;
}

function readTelegramConfig(): {
  enabled: boolean;
  has_bot_token: boolean;
  chat_id: string | null;
  env_configured: boolean;
} {
  const settings = readSettings();
  const enabled = settings.telegram?.enabled ?? true;
  const token = (settings.telegram?.bot_token || '').trim();
  const chatId = (settings.telegram?.chat_id || '').trim();
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const envChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  return {
    enabled,
    has_bot_token: Boolean(token || envToken),
    chat_id: chatId || envChatId || null,
    env_configured: Boolean(envToken && envChatId),
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ ok: true, telegram: readTelegramConfig() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load telegram settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load telegram settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
      bot_token?: string;
      clear_bot_token?: boolean;
      chat_id?: string;
      clear_chat_id?: boolean;
    };

    const settings = readSettings();
    settings.telegram = settings.telegram || {};

    if (typeof body.enabled === 'boolean') settings.telegram.enabled = body.enabled;

    if (body.clear_bot_token === true) {
      delete settings.telegram.bot_token;
    } else {
      const token = normalizeText(body.bot_token);
      if (token !== null) settings.telegram.bot_token = token;
    }

    if (body.clear_chat_id === true) {
      delete settings.telegram.chat_id;
    } else {
      const chatId = normalizeText(body.chat_id);
      if (chatId !== null) settings.telegram.chat_id = chatId;
    }

    writeSettings(settings);
    return NextResponse.json({ ok: true, telegram: readTelegramConfig() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update telegram settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update telegram settings' }, { status: 500 });
  }
}

