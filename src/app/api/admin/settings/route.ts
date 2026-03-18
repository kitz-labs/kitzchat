import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  readSettings,
  setAllowCronWrite,
  setAllowPolicyWrite,
  setAllowStripeWrite,
  setAllowUserDeletion,
  setAllowUserRegistration,
  setAllowWorkspaceWrite,
} from '@/lib/settings';
import { getSecretEncryptionSource, isSecretEncryptionAvailable } from '@/lib/secret-store';

function serializeAdminSettings() {
  const settings = readSettings();
  return {
    ...settings,
    security_status: {
      customer_secret_encryption_available: isSecretEncryptionAvailable(),
      customer_secret_encryption_source: getSecretEncryptionSource(),
    },
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ settings: serializeAdminSettings() });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as {
      allow_user_deletion?: boolean;
      allow_policy_write?: boolean;
      allow_cron_write?: boolean;
      allow_workspace_write?: boolean;
      allow_user_registration?: boolean;
      allow_stripe_write?: boolean;
    };
    if (typeof body.allow_user_deletion === 'boolean') {
      setAllowUserDeletion(!!body.allow_user_deletion);
    }
    if (typeof body.allow_policy_write === 'boolean') {
      setAllowPolicyWrite(!!body.allow_policy_write);
    }
    if (typeof body.allow_cron_write === 'boolean') {
      setAllowCronWrite(!!body.allow_cron_write);
    }
    if (typeof body.allow_workspace_write === 'boolean') {
      setAllowWorkspaceWrite(!!body.allow_workspace_write);
    }
    if (typeof body.allow_user_registration === 'boolean') {
      setAllowUserRegistration(!!body.allow_user_registration);
    }
    if (typeof body.allow_stripe_write === 'boolean') {
      setAllowStripeWrite(!!body.allow_stripe_write);
    }
    return NextResponse.json({ settings: serializeAdminSettings() });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
