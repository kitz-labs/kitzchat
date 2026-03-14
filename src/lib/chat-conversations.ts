function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'chat';
}

export function normalizeConversationTitle(title: string | null | undefined, fallback = 'Neuer Chat'): string {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 80) || fallback;
}

export function generateCustomerConversationId(userId: number, agentId: string): string {
  return `customer:${userId}:${sanitizeSegment(agentId)}:${Date.now().toString(36)}`;
}

export function sanitizeDownloadName(value: string): string {
  return sanitizeSegment(value).slice(0, 80) || 'chat';
}

export function inferCustomerAgentId(conversationId: string): string | null {
  const parts = conversationId.split(':');
  if (parts.length >= 3 && parts[0] === 'customer') {
    return parts[2] || null;
  }
  return null;
}