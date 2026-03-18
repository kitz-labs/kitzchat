export type MailDraft = {
  to: string[];
  subject: string;
  text: string;
};

export function extractMailDraft(raw: string): { cleanText: string; draft: MailDraft | null } {
  const text = typeof raw === 'string' ? raw : '';
  const start = text.indexOf('```mail_draft');
  if (start < 0) return { cleanText: text, draft: null };
  const end = text.indexOf('```', start + 3);
  if (end < 0) return { cleanText: text, draft: null };

  const before = text.slice(0, start).trim();
  const block = text.slice(start, end + 3);
  const after = text.slice(end + 3).trim();

  const jsonStart = block.indexOf('\n');
  const jsonBody = jsonStart >= 0 ? block.slice(jsonStart).replace(/```$/m, '').trim() : '';

  try {
    const parsed = JSON.parse(jsonBody) as Partial<MailDraft>;
    const to = Array.isArray(parsed.to) ? parsed.to.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean) : [];
    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const draftText = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (to.length === 0 || !subject || !draftText) {
      return { cleanText: [before, after].filter(Boolean).join('\n\n'), draft: null };
    }
    return {
      cleanText: [before, after].filter(Boolean).join('\n\n'),
      draft: { to, subject, text: draftText },
    };
  } catch {
    return { cleanText: [before, after].filter(Boolean).join('\n\n'), draft: null };
  }
}

