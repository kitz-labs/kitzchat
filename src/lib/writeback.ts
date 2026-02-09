import fs from 'fs';
import path from 'path';

const STATE_DIR = process.env.HERMES_STATE_DIR || '/home/leads/workspace/state';

/**
 * Write a status change back to a JSON state file so the Hermes agent picks it up.
 * Reads the file, finds the item by id, updates the status, writes back.
 * Silently no-ops if the file doesn't exist (local dev without state files).
 */
function updateJsonFile(
  filename: string,
  id: string,
  updates: Record<string, unknown>,
) {
  const filePath = path.join(STATE_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      const item = data.find((d: Record<string, unknown>) => d.id === id);
      if (item) {
        Object.assign(item, updates);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      }
    }
  } catch {
    // Silently fail — state files may not exist in local dev
  }
}

/** Update content status in content-queue.json */
export function writebackContentStatus(id: string, status: string) {
  updateJsonFile('content-queue.json', id, { status });
}

/** Update sequence/email draft status in sequences.json */
export function writebackSequenceStatus(id: string, status: string) {
  updateJsonFile('sequences.json', id, { status });
}

/** Update lead status in leads.json */
export function writebackLeadStatus(id: string, status: string) {
  updateJsonFile('leads.json', id, { status });
}

/** Update arbitrary lead fields in leads.json */
export function writebackLeadUpdate(id: string, updates: Record<string, unknown>) {
  updateJsonFile('leads.json', id, updates);
}
