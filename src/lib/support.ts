import { getDb, getDbPath } from './db';
import { getAppStateDir } from './app-state';
import { listUsers, type User } from './auth';

export type SupportThreadSummary = {
  user_id: number;
  username: string;
  email: string | null;
  payment_status: string | null;
  customer_created_at: string;
  message_count: number;
  unread_customer_count: number;
  unread_support_count: number;
  last_sender: 'customer' | 'support';
  last_message: string;
  last_message_at: string | null;
};

export type SupportMessageRecord = {
  id: number;
  sender: 'customer' | 'support';
  message: string;
  read_at: string | null;
  created_at: string;
};

export type SupportConversation = {
  customer: User;
  messages: SupportMessageRecord[];
};

export function listSupportThreads(): { threads: SupportThreadSummary[]; summary: { total_threads: number; unread_threads: number; unread_customer_messages: number } } {
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       u.id AS user_id,
       u.username,
       u.email,
       u.payment_status,
       u.created_at AS customer_created_at,
       COUNT(sm.id) AS message_count,
       SUM(CASE WHEN sm.sender = 'customer' AND sm.read_at IS NULL THEN 1 ELSE 0 END) AS unread_customer_count,
       SUM(CASE WHEN sm.sender = 'support' AND sm.read_at IS NULL THEN 1 ELSE 0 END) AS unread_support_count,
       MAX(sm.created_at) AS last_message_at,
       COALESCE((SELECT latest.sender FROM support_messages latest WHERE latest.user_id = u.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1), 'customer') AS last_sender,
       COALESCE((SELECT latest.message FROM support_messages latest WHERE latest.user_id = u.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1), '') AS last_message
     FROM users u
     JOIN support_messages sm ON sm.user_id = u.id
     WHERE u.account_type = 'customer'
     GROUP BY u.id
     ORDER BY last_message_at DESC, u.id DESC`,
  ).all() as Array<SupportThreadSummary>;

  return {
    threads: rows,
    summary: {
      total_threads: rows.length,
      unread_threads: rows.filter((row) => row.unread_customer_count > 0).length,
      unread_customer_messages: rows.reduce((sum, row) => sum + Number(row.unread_customer_count ?? 0), 0),
    },
  };
}

export function getSupportConversation(userId: number, options?: { markCustomerRead?: boolean }): SupportConversation {
  const customer = listUsers().find((user) => user.id === userId && user.account_type === 'customer');
  if (!customer) {
    throw new Error('customer_not_found');
  }

  const db = getDb();
  if (options?.markCustomerRead) {
    db.prepare("UPDATE support_messages SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND sender = 'customer' AND read_at IS NULL").run(userId);
  }

  const messages = db.prepare(
    `SELECT id, sender, message, read_at, created_at
     FROM support_messages
     WHERE user_id = ?
     ORDER BY created_at ASC, id ASC`,
  ).all(userId) as SupportMessageRecord[];

  return { customer, messages };
}

export function insertSupportReply(userId: number, message: string): SupportConversation {
  const db = getDb();
  const customer = listUsers().find((user) => user.id === userId && user.account_type === 'customer');
  if (!customer) {
    throw new Error('customer_not_found');
  }

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO support_messages (user_id, sender, message, read_at) VALUES (?, ?, ?, NULL)').run(userId, 'support', message);
    db.prepare('INSERT INTO notifications (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)').run(
      'support-reply',
      'info',
      'Neue Support-Antwort',
      `Support hat ${customer.username} geantwortet.`,
      JSON.stringify({ user_id: customer.id, username: customer.username, source: 'admin-support' }),
    );
  });
  tx();

  return getSupportConversation(userId);
}

export function getSupportDbOverview() {
  const db = getDb();
  const tableRows = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
  ).all() as Array<{ name: string }>;

  const tables = tableRows.map(({ name }) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get() as { count: number };
      return { name, count: row?.count ?? 0 };
    } catch {
      return { name, count: 0 };
    }
  });

  return {
    db_path: getDbPath(),
    state_dir: getAppStateDir(),
    tables,
  };
}