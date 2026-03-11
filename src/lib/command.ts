import { spawn } from 'node:child_process';

const ADMIN_CLI = process.env.KITZCHAT_ADMIN_CLI?.trim() || '';

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function localFallbackResponse(message: string, agentId?: string): CommandResult {
  const preview = message.slice(0, 220);
  const specialized: Record<string, string> = {
    main: 'KitzChat arbeitet im lokalen Modus. Ich koordiniere deine Anfrage, teile sie in sinnvolle Arbeitspakete und zeige dir den naechsten besten Ablauf.',
    marketing: 'Der Marketing-Agent laeuft lokal. Ich kann Kampagnen, Hooks, Inhalte und Positionierungen sofort strukturieren und in umsetzbare Schritte zerlegen.',
    apollo: 'Der Sales-Agent laeuft lokal. Ich kann Leads priorisieren, Antworten vorbereiten und Outreach-Sequenzen aufbauen.',
    athena: 'Der Recherche-Agent laeuft lokal. Ich kann dir aus der Anfrage ein klares Briefing, Suchrichtungen und Ergebnisstruktur bauen.',
    metis: 'Der Analyse-Agent laeuft lokal. Ich fasse vorhandene Nutzungs- und Betriebsdaten in klare Kennzahlen, Risiken und Trends zusammen.',
    'kb-manager': 'Der Wissens-Agent laeuft lokal. Ich bereite Inhalte fuer dauerhafte Ablage, Zusammenfassungen und wiederverwendbare Wissenseintraege vor.',
    'browser-operator': 'Der Browser-Agent laeuft lokal. Ich beschreibe dir den Web-Workflow, pruefe Schritte und markiere manuelle Aktionen.',
    codepilot: 'Der Technik-Agent laeuft lokal. Ich formuliere Umsetzungsplaene, technische Checks und saubere naechste Schritte.',
    'support-concierge': 'Der Support-Agent laeuft lokal. Ich schreibe dir belastbare, kundenfreundliche Antworten und Eskalationsvorschlaege.',
    'campaign-studio': 'Der Kampagnen-Agent laeuft lokal. Ich baue aus deinem Ziel einen Launch-Plan mit Sequenzen, Assets und Tests.',
    'insta-agent': 'Der Insta Agent laeuft lokal mit deinen gespeicherten Zugangsdaten. Ich kann Setup, Checklisten und Inhaltsablaeufe vorbereiten.',
    'docu-agent': 'Der DocuAgent laeuft lokal. Ich kann Dokumente klassifizieren, Ablagestrukturen vorschlagen und die hinterlegte Cloud- oder lokale Zielablage beruecksichtigen.',
    'mail-agent': 'Der MailAgent laeuft lokal. Ich kann Postfach-Regeln, Antwortentwuerfe, Priorisierung und Bearbeitungsablaufe anhand deiner Verbindung vorbereiten.',
  };
  return {
    stdout: JSON.stringify({
      response: `${specialized[agentId || ''] || 'KitzChat arbeitet im lokalen Modus. Die Nachricht bleibt in der App und wird ohne externes Agent-CLI verarbeitet.'}\n\nVorschau der aktuellen Anfrage:\n${preview}`,
    }),
    stderr: '',
    code: 0,
  };
}

export function runLeadsAdmin(
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (!ADMIN_CLI) {
      const agentIdx = args.indexOf('--agent');
      const messageIdx = args.indexOf('--message');
      const agentId = agentIdx >= 0 ? args[agentIdx + 1] : undefined;
      const message = messageIdx >= 0 ? args[messageIdx + 1] : '';
      resolve(localFallbackResponse(message, agentId));
      return;
    }

    const child = spawn(ADMIN_CLI, args, { shell: false });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;

    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
    }

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Send a message to an agent via the gateway.
 * Uses `leads-admin agent --agent <id> --message <text> --json`
 * Returns the agent's response text.
 */
export async function sendAgentMessage(
  agentId: string,
  message: string,
  sessionId?: string,
): Promise<{ response: string; sessionId?: string }> {
  const args = [
    'agent',
    '--agent', agentId,
    '--message', message,
    '--json',
  ];
  if (sessionId) {
    args.push('--session-id', sessionId);
  }

  const result = await runLeadsAdmin(args, { timeoutMs: 120_000 });

  // Parse JSON response
  try {
    const data = JSON.parse(result.stdout);
    return {
      response: data.response || data.content || result.stdout.trim(),
      sessionId: data.sessionId,
    };
  } catch {
    // Fall back to raw stdout
    return { response: result.stdout.trim() };
  }
}

/**
 * Send a message to the default orchestrator routing via the optional admin CLI.
 */
export async function sendOrchestratorMessage(
  message: string,
  sessionId?: string,
): Promise<{ response: string; sessionId?: string }> {
  const args = [
    'agent',
    '--message', message,
    '--json',
  ];
  if (sessionId) {
    args.push('--session-id', sessionId);
  }

  const result = await runLeadsAdmin(args, { timeoutMs: 120_000 });

  try {
    const data = JSON.parse(result.stdout);
    return {
      response: data.response || data.content || result.stdout.trim(),
      sessionId: data.sessionId,
    };
  } catch {
    return { response: result.stdout.trim() };
  }
}
