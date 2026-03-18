import { NextResponse } from 'next/server';
import { requireAdmin, requireUser, userHasAgentAccess, userHasFreeCustomerAccess } from '@/lib/auth';
import { userHasCapability, type Capability } from '@/lib/rbac';

export function requireApiUser(request: Request): NextResponse | null {
  try {
    requireUser(request);
    return null;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export function requireApiAdmin(request: Request): NextResponse | null {
  try {
    requireAdmin(request);
    return null;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
}

export function requireApiEditor(request: Request): NextResponse | null {
  try {
    const user = requireUser(request);
    if (user.role === 'admin' || user.role === 'editor') {
      return null;
    }
    return NextResponse.json({ error: 'Editor access required' }, { status: 403 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export function requireApiCapability(request: Request, capability: Capability): NextResponse | null {
  try {
    const user = requireUser(request);
    if (!userHasCapability({ id: user.id, role: user.role }, capability)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    return null;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
}

export function requireApiChatUser(request: Request): NextResponse | null {
  try {
    const user = requireUser(request);
    if (user.role === 'admin' || user.role === 'editor' || userHasAgentAccess(user) || userHasFreeCustomerAccess(user)) {
      return null;
    }
    return NextResponse.json({ error: 'Payment required to use chat' }, { status: 402 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
