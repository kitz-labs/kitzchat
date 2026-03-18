import { getDb } from '@/lib/db';

export type Role = 'admin' | 'editor' | 'viewer';

export type Capability =
  | 'dashboard.read'
  | 'users.read'
  | 'users.write'
  | 'rbac.read'
  | 'rbac.write'
  | 'customers.read'
  | 'customers.write'
  | 'agents.read'
  | 'agents.write'
  | 'agents.publish'
  | 'analytics.read'
  | 'audit.read'
  | 'stripe.read'
  | 'stripe.write'
  | 'billing.read'
  | 'billing.write'
  | 'wallet.reconcile'
  | 'integrations.read'
  | 'integrations.write'
  | 'secrets.read'
  | 'schema.read'
  | 'memory.read'
  | 'memory.write'
  | 'system.write'
  | 'automations.approve'
  | 'ops.write'
  | 'chat.send';

export type CapabilityDefinition = {
  key: Capability;
  label: string;
  group: 'Core' | 'Access' | 'Customers' | 'Agents' | 'Analytics' | 'Billing' | 'Integrations' | 'System';
  description?: string;
};

export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  { key: 'dashboard.read', label: 'Dashboard anzeigen', group: 'Core' },
  { key: 'chat.send', label: 'Chat senden', group: 'Core' },
  { key: 'ops.write', label: 'Ops/CRM/Content schreiben', group: 'Core' },
  { key: 'automations.approve', label: 'Automations freigeben', group: 'Core' },

  { key: 'users.read', label: 'User lesen', group: 'Access' },
  { key: 'users.write', label: 'User verwalten', group: 'Access' },
  { key: 'rbac.read', label: 'Rollen/Rechte lesen', group: 'Access' },
  { key: 'rbac.write', label: 'Rollen/Rechte verwalten', group: 'Access' },

  { key: 'customers.read', label: 'Kunden lesen', group: 'Customers' },
  { key: 'customers.write', label: 'Kunden verwalten', group: 'Customers' },

  { key: 'agents.read', label: 'Agenten lesen', group: 'Agents' },
  { key: 'agents.write', label: 'Agenten konfigurieren', group: 'Agents' },
  { key: 'agents.publish', label: 'Agenten publishen', group: 'Agents' },

  { key: 'analytics.read', label: 'Analytics lesen', group: 'Analytics' },
  { key: 'audit.read', label: 'Audit/Logs lesen', group: 'Analytics' },

  { key: 'stripe.read', label: 'Stripe lesen', group: 'Billing' },
  { key: 'stripe.write', label: 'Stripe schreiben (Danger)', group: 'Billing' },
  { key: 'billing.read', label: 'Billing lesen', group: 'Billing' },
  { key: 'billing.write', label: 'Billing konfigurieren', group: 'Billing' },
  { key: 'wallet.reconcile', label: 'Wallet Reconciliation ausfuehren', group: 'Billing' },

  { key: 'integrations.read', label: 'Integrations lesen', group: 'Integrations' },
  { key: 'integrations.write', label: 'Integrations verwalten', group: 'Integrations' },

  { key: 'secrets.read', label: 'Secrets Status lesen', group: 'System' },
  { key: 'schema.read', label: 'Schema Status lesen', group: 'System' },
  { key: 'memory.read', label: 'Memory lesen', group: 'System' },
  { key: 'memory.write', label: 'Memory konfigurieren', group: 'System' },
  { key: 'system.write', label: 'System Settings schreiben', group: 'System' },
];

const DEFAULT_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: CAPABILITY_DEFINITIONS.map((c) => c.key),
  editor: [
    'dashboard.read',
    'chat.send',
    'ops.write',
    'automations.approve',
    'customers.read',
    'agents.read',
    'analytics.read',
    'integrations.read',
    'billing.read',
    'stripe.read',
    'memory.read',
    'schema.read',
  ],
  viewer: ['dashboard.read', 'agents.read', 'analytics.read', 'integrations.read', 'billing.read', 'stripe.read', 'memory.read', 'schema.read'],
};

function ensureRbacTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rbac_role_capabilities (
      role TEXT NOT NULL,
      capability TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(role, capability)
    );
    CREATE TABLE IF NOT EXISTS rbac_user_capabilities (
      user_id INTEGER NOT NULL,
      capability TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, capability)
    );
    CREATE INDEX IF NOT EXISTS idx_rbac_user_cap_user ON rbac_user_capabilities(user_id);
  `);
}

function normalizeRole(role: string): Role {
  if (role === 'admin' || role === 'editor' || role === 'viewer') return role;
  return 'viewer';
}

function normalizeCapability(value: string): Capability | null {
  const key = value.trim() as Capability;
  return CAPABILITY_DEFINITIONS.some((c) => c.key === key) ? key : null;
}

export function listRoles(): Role[] {
  return ['admin', 'editor', 'viewer'];
}

export function listCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_DEFINITIONS;
}

export function getRoleOverrides(role: Role): Record<Capability, boolean | null> {
  ensureRbacTables();
  const db = getDb();
  const rows = db.prepare('SELECT capability, enabled FROM rbac_role_capabilities WHERE role = ?').all(role) as { capability: string; enabled: number }[];
  const map: Record<string, boolean> = {};
  for (const row of rows) {
    const cap = normalizeCapability(row.capability);
    if (!cap) continue;
    map[cap] = Boolean(row.enabled);
  }
  const result = {} as Record<Capability, boolean | null>;
  for (const def of CAPABILITY_DEFINITIONS) {
    result[def.key] = Object.prototype.hasOwnProperty.call(map, def.key) ? map[def.key] : null;
  }
  return result;
}

export function setRoleOverride(role: Role, capability: Capability, enabled: boolean | null): void {
  ensureRbacTables();
  const db = getDb();
  if (enabled === null) {
    db.prepare('DELETE FROM rbac_role_capabilities WHERE role = ? AND capability = ?').run(role, capability);
    return;
  }
  db.prepare(
    `INSERT INTO rbac_role_capabilities (role, capability, enabled, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(role, capability) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
  ).run(role, capability, enabled ? 1 : 0);
}

export function getUserOverrides(userId: number): Record<Capability, boolean | null> {
  ensureRbacTables();
  const db = getDb();
  const rows = db.prepare('SELECT capability, enabled FROM rbac_user_capabilities WHERE user_id = ?').all(userId) as { capability: string; enabled: number }[];
  const map: Record<string, boolean> = {};
  for (const row of rows) {
    const cap = normalizeCapability(row.capability);
    if (!cap) continue;
    map[cap] = Boolean(row.enabled);
  }
  const result = {} as Record<Capability, boolean | null>;
  for (const def of CAPABILITY_DEFINITIONS) {
    result[def.key] = Object.prototype.hasOwnProperty.call(map, def.key) ? map[def.key] : null;
  }
  return result;
}

export function setUserOverride(userId: number, capability: Capability, enabled: boolean | null): void {
  ensureRbacTables();
  const db = getDb();
  if (enabled === null) {
    db.prepare('DELETE FROM rbac_user_capabilities WHERE user_id = ? AND capability = ?').run(userId, capability);
    return;
  }
  db.prepare(
    `INSERT INTO rbac_user_capabilities (user_id, capability, enabled, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, capability) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
  ).run(userId, capability, enabled ? 1 : 0);
}

export function getEffectiveRoleCapabilities(role: Role): Capability[] {
  const base = new Set<Capability>(DEFAULT_ROLE_CAPABILITIES[role] ?? []);
  const overrides = getRoleOverrides(role);
  for (const def of CAPABILITY_DEFINITIONS) {
    const ov = overrides[def.key];
    if (ov === null) continue;
    if (ov) base.add(def.key);
    else base.delete(def.key);
  }
  return Array.from(base);
}

export function userHasCapability(user: { id: number; role: string }, capability: Capability): boolean {
  const role = normalizeRole(user.role);
  if (role === 'admin') return true;
  const userOverrides = getUserOverrides(user.id);
  const ov = userOverrides[capability];
  if (ov !== null) return ov;
  return getEffectiveRoleCapabilities(role).includes(capability);
}

export function getRoleMatrix() {
  const roles = listRoles();
  const capabilities = listCapabilities();
  const roleCapabilities = Object.fromEntries(roles.map((role) => [role, getEffectiveRoleCapabilities(role)])) as Record<Role, Capability[]>;
  const roleOverrides = Object.fromEntries(roles.map((role) => [role, getRoleOverrides(role)])) as Record<Role, Record<Capability, boolean | null>>;
  return {
    roles,
    capabilities,
    roleCapabilities,
    roleOverrides,
  };
}
