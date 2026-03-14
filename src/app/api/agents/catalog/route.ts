import { NextResponse } from 'next/server';
import { loadAgentCatalog, updateAgentCatalogEntry } from '@/lib/agent-config';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ agents: loadAgentCatalog() });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to load agent catalog' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      role?: string;
      description?: string;
      model?: string;
      fallbacks?: string[];
      tools?: string[];
      apiProviders?: string[];
      inspiredBy?: string;
      sourceRepo?: string;
      customerVisible?: boolean;
      systemPrompt?: string;
      inputFormat?: string;
      outputFormat?: string;
      limits?: string[];
      policies?: string[];
      modelUsage?: {
        reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
        temperature?: number;
        maxToolCalls?: number;
        maxOutputTokens?: number;
        maxContextMessages?: number;
        escalationModel?: string;
      };
    };

    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const updated = updateAgentCatalogEntry(undefined, body.id, {
      name: body.name,
      role: body.role,
      description: body.description,
      model: body.model,
      fallbacks: body.fallbacks,
      tools: body.tools,
      apiProviders: body.apiProviders,
      inspiredBy: body.inspiredBy,
      sourceRepo: body.sourceRepo,
      customerVisible: body.customerVisible,
      systemPrompt: body.systemPrompt,
      inputFormat: body.inputFormat,
      outputFormat: body.outputFormat,
      limits: body.limits,
      policies: body.policies,
      modelUsage: body.modelUsage,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ agent: updated });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to update agent catalog' }, { status: 500 });
  }
}