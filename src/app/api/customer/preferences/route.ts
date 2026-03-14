import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences, updateCustomerPreferences } from '@/lib/customer-preferences';
import type { CustomerIntegrationProfile } from '@/lib/integration-catalog';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }
    return NextResponse.json({ preferences: ensureCustomerPreferences(user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load preferences';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      enabled_agent_ids?: string[];
      usage_alert_enabled?: boolean;
      usage_alert_daily_tokens?: number;
      memory_storage_mode?: 'state' | 'custom';
      memory_storage_path?: string;
      docu_provider?: string;
      docu_root_path?: string;
      docu_account_email?: string;
      docu_app_password?: string;
      docu_api_key?: string;
      docu_access_token?: string;
      mail_provider?: string;
      mail_display_name?: string;
      mail_address?: string;
      mail_password?: string;
      mail_imap_host?: string;
      mail_imap_port?: number;
      mail_smtp_host?: string;
      mail_smtp_port?: number;
      mail_pop3_host?: string;
      mail_pop3_port?: number;
      mail_use_ssl?: boolean;
      instagram_username?: string;
      instagram_password?: string;
      instagram_graph_api?: string;
      instagram_user_access_token?: string;
      instagram_user_id?: string;
      facebook_page_id?: string;
      integration_profiles?: CustomerIntegrationProfile[];
    };

    return NextResponse.json({ preferences: updateCustomerPreferences(user.id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update preferences';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
