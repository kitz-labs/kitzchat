'use client';

import { useState, useEffect } from 'react';
import {
  Settings, Database, Shield, Info, ExternalLink,
  RefreshCw, Trash2, Users, UserPlus, KeyRound, BrainCircuit, BellRing, CreditCard, Webhook,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { timeAgo } from '@/lib/utils';
import { CustomerSettings } from '@/components/customer/customer-settings';
import { PasskeyManager } from '@/components/auth/passkey-manager';
import { WebsiteFtpSettings } from '@/components/admin/website-ftp-settings';
import pkg from '../../../package.json';

interface SyncInfo {
  db_path: string;
  state_dir: string;
  db_size_mb: number;
  tables: { name: string; count: number }[];
  last_sync: string | null;
  sync_health?: {
    last_sync_started_at?: string | null;
    last_sync_at?: string | null;
    last_sync_status?: string | null;
    last_sync_error?: string | null;
    last_sync_duration_ms?: number | null;
    last_success_at?: string | null;
    last_success_duration_ms?: number | null;
  } | null;
  sync_files?: {
    filename: string;
    last_seen_at?: string | null;
    last_mtime?: string | null;
    size_bytes?: number | null;
    last_status?: string | null;
    last_error?: string | null;
  }[];
  seed_count: number;
}

type Role = 'admin' | 'editor' | 'viewer';
type SettingsTab = 'general' | 'memory' | 'stripe' | 'access' | 'system' | 'website' | 'about';

interface BillingConfig {
  stripe_secret_configured: boolean;
  stripe_webhook_configured: boolean;
  billing_mode: 'dev-simulated' | 'live-or-test';
  env_keys_required: string[];
  webhook_path: string;
  public_base_url?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  webhook_url?: string | null;
}

interface EmailConfigStatus {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  has_password: boolean;
  public_base_url: string;
  signature_configured: boolean;
}

interface EmailSettingsPayload {
  status: EmailConfigStatus;
  transport?: { ok: boolean; detail?: string };
  current?: {
    public_base_url?: string | null;
    host?: string | null;
    port?: number | null;
    user?: string | null;
    from?: string | null;
    signature_html?: string | null;
    signature_text?: string | null;
  };
}

interface EmailAssetRecord {
  name: string;
  url: string;
}

interface BrandingStatusPayload {
  exists: boolean;
  url: string;
  updated_at: string | null;
}

interface SchemaStatusPayload {
  checked_at: string;
  sqlite: {
    path: string;
    size_bytes: number | null;
    sqlite_version: string | null;
    tables: { name: string; count?: number }[];
  };
  billing: {
    configured: boolean;
    kind: 'postgres' | 'mysql' | null;
    schema_migrations_applied: string[];
    schema_migrations_pending: string[];
    migrations_dir: string | null;
  };
}

interface TopupOffer {
  offerCode: string;
  name: string;
  amountEur: number;
  credits: number;
  bonusCredits: number;
  active: boolean;
  sortOrder: number;
  marketingLabel?: string | null;
}

interface UserRecord {
  id: number;
  username: string;
  role: Role;
  created_at: string;
  email?: string | null;
  auth_provider?: string | null;
}

interface LoginRequestRecord {
  id: number;
  email: string;
  google_sub?: string | null;
  status: 'pending' | 'approved' | 'denied';
  requested_role: Role;
  attempts: number;
  last_error?: string | null;
  last_attempt_at: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string | null;
}

interface MeResponse {
  app_audience?: 'admin' | 'customer';
  user?: { id: number; username: string; role: Role; account_type?: 'staff' | 'customer'; payment_status?: 'not_required' | 'pending' | 'paid'; has_agent_access?: boolean; };
}

interface WorkspaceInstance {
  id: string;
  label: string;
}

interface MemoryPolicy {
  decay_half_life_days: number;
  min_effective_confidence: number;
  min_keep_confidence: number;
  low_confidence_prune_days: number;
  default_ttl_days: number;
}

type InstanceId = string;

interface AlertPolicy {
  window_days: number;
  alert_contradictions_threshold: number;
  alert_duplicates_threshold: number;
  alert_weak_agents_threshold: number;
  alert_never_ratio_threshold: number;
}

interface MemoryEffectPayload {
  instance: string;
  available: boolean;
  reason?: string;
  history_points?: number;
  policy_changes?: number;
  latest_policy_change?: string;
  baseline_at?: string;
  current_at?: string;
  deltas?: {
    contradictions: { before: number; after: number; delta: number };
    duplicates: { before: number; after: number; delta: number };
    weak_agents: { before: number; after: number; delta: number };
    hot_memory: { before: number; after: number; delta: number };
    never_accessed_ratio: { before: number; after: number; delta: number };
  };
}

export default function SettingsPage() {
  const dashboardVersion = pkg.version || 'dev';
  const [instances, setInstances] = useState<WorkspaceInstance[]>([]);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [currentUser, setCurrentUser] = useState<MeResponse['user'] | null>(null);
  const [appAudience, setAppAudience] = useState<'admin' | 'customer'>('admin');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loginRequests, setLoginRequests] = useState<LoginRequestRecord[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<Role>('editor');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});
  const [requestRoleDrafts, setRequestRoleDrafts] = useState<Record<string, Role>>({});
  const [policies, setPolicies] = useState<Record<InstanceId, MemoryPolicy | null>>({});
  const [savingPolicy, setSavingPolicy] = useState<Record<InstanceId, boolean>>({});
  const [alertPolicies, setAlertPolicies] = useState<Record<InstanceId, AlertPolicy | null>>({});
  const [savingAlertPolicy, setSavingAlertPolicy] = useState<Record<InstanceId, boolean>>({});
  const [memoryEffects, setMemoryEffects] = useState<Record<InstanceId, MemoryEffectPayload | null>>({});
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatusPayload | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsPayload | null>(null);
  const [emailDraft, setEmailDraft] = useState<{
    public_base_url: string;
    host: string;
    port: number;
    user: string;
    from: string;
    password: string;
    signature_html: string;
  }>({ public_base_url: '', host: '', port: 587, user: '', from: '', password: '', signature_html: '' });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState('');
  const [emailAssets, setEmailAssets] = useState<EmailAssetRecord[]>([]);
  const [emailAssetsLoading, setEmailAssetsLoading] = useState(false);
  const [emailAssetUploading, setEmailAssetUploading] = useState(false);
  const [emailAssetName, setEmailAssetName] = useState('');
  const [brandingLogo, setBrandingLogo] = useState<BrandingStatusPayload | null>(null);
  const [brandingFavicon, setBrandingFavicon] = useState<BrandingStatusPayload | null>(null);
  const [brandingIcon, setBrandingIcon] = useState<BrandingStatusPayload | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingUploading, setBrandingUploading] = useState<Record<'logo' | 'favicon' | 'icon', boolean>>({ logo: false, favicon: false, icon: false });
  const [rbacMatrix, setRbacMatrix] = useState<{
    roles: Role[];
    capabilities: { key: string; label: string; group?: string; description?: string }[];
    roleCapabilities: Record<Role, string[]>;
    roleOverrides?: Record<Role, Record<string, boolean | null>>;
  } | null>(null);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [topupOffers, setTopupOffers] = useState<TopupOffer[]>([]);
  const [offerDraft, setOfferDraft] = useState<TopupOffer>({
    offerCode: '',
    name: '',
    amountEur: 20,
    credits: 20000,
    bonusCredits: 0,
    active: true,
    sortOrder: 1,
    marketingLabel: '',
  });
  const [savingOffer, setSavingOffer] = useState(false);
  const [meResolved, setMeResolved] = useState(false);
	  const [appSettings, setAppSettings] = useState<{
	    allow_user_deletion?: boolean;
	    allow_policy_write?: boolean;
	    allow_cron_write?: boolean;
	    allow_workspace_write?: boolean;
	    allow_user_registration?: boolean;
	    allow_stripe_write?: boolean;
	  } | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      fetch('/api/settings').then(r => r.json()).then(setSyncInfo).catch(() => {});
      fetch('/api/billing/config').then(r => r.json()).then(setBillingConfig).catch(() => {});
      fetch('/api/admin/topup-offers').then(r => r.json()).then((data) => setTopupOffers(Array.isArray(data?.offers) ? data.offers : [])).catch(() => {});

      // Discover configured workspace instances from the server.
      let discovered: WorkspaceInstance[] = [];
      try {
        const res = await fetch('/api/instances', { cache: 'no-store' });
        const data = await res.json();
        discovered = Array.isArray(data.instances) ? data.instances : [];
      } catch {
        // Fallback for local-only mode.
        discovered = [
          { id: 'default', label: 'Default Workspace' },
        ];
      }

      if (!alive) return;
      setInstances(discovered);

      const initPolicies: Record<string, MemoryPolicy | null> = {};
      const initSaving: Record<string, boolean> = {};
      const initAlert: Record<string, AlertPolicy | null> = {};
      const initAlertSaving: Record<string, boolean> = {};
      const initEffects: Record<string, MemoryEffectPayload | null> = {};
      for (const it of discovered) {
        initPolicies[it.id] = null;
        initSaving[it.id] = false;
        initAlert[it.id] = null;
        initAlertSaving[it.id] = false;
        initEffects[it.id] = null;
      }
      setPolicies(initPolicies);
      setSavingPolicy(initSaving);
      setAlertPolicies(initAlert);
      setSavingAlertPolicy(initAlertSaving);
      setMemoryEffects(initEffects);

      await Promise.all(discovered.map(async (it) => {
        try {
          const p = await fetch(`/api/memory-policy?instance=${encodeURIComponent(it.id)}`, { cache: 'no-store' }).then(r => r.json());
          if (alive) setPolicies(prev => ({ ...prev, [it.id]: p.policy ?? null }));
        } catch {}
        try {
          const ap = await fetch(`/api/memory-alert-policy?instance=${encodeURIComponent(it.id)}`, { cache: 'no-store' }).then(r => r.json());
          if (alive) setAlertPolicies(prev => ({ ...prev, [it.id]: ap.policy ?? null }));
        } catch {}
        try {
          const eff = await fetch(`/api/memory-effect?instance=${encodeURIComponent(it.id)}`, { cache: 'no-store' }).then(r => r.json());
          if (alive) setMemoryEffects(prev => ({ ...prev, [it.id]: eff ?? null }));
        } catch {}
      }));
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // load admin runtime settings
    (async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        setAppSettings(data?.settings || null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: MeResponse) => {
        setCurrentUser(data.user || null);
        setAppAudience(data.app_audience === 'customer' ? 'customer' : 'admin');
        setMeResolved(true);
      })
      .catch(() => {
        setCurrentUser(null);
        setAppAudience('admin');
        setMeResolved(true);
      });
  }, []);

  useEffect(() => {
    if (!meResolved) return;
    if (appAudience === 'customer') return;
    (async () => {
      setEmailLoading(true);
      try {
        const res = await fetch('/api/admin/email/settings', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEmailSettings(data as EmailSettingsPayload);
          const st = (data as EmailSettingsPayload)?.status;
          const cur = (data as EmailSettingsPayload)?.current;
          if (st) {
            setEmailDraft({
              public_base_url: cur?.public_base_url || st.public_base_url || '',
              host: cur?.host || st.host || '',
              port: cur?.port || st.port || 587,
              user: cur?.user || st.user || '',
              from: cur?.from || st.from || '',
              password: '',
              signature_html: cur?.signature_html || '',
            });
          }
        }
      } catch {
        // ignore
      } finally {
        setEmailLoading(false);
      }
    })();
  }, [meResolved, appAudience]);

  async function refreshEmailAssets() {
    setEmailAssetsLoading(true);
    try {
      const res = await fetch('/api/admin/email/assets', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Assets laden fehlgeschlagen'));
      const files = Array.isArray((data as any)?.files) ? (data as any).files : [];
      setEmailAssets(files.filter((f: any) => typeof f?.name === 'string' && typeof f?.url === 'string'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailAssetsLoading(false);
    }
  }

  async function uploadEmailAsset(file: File) {
    setEmailAssetUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      if (emailAssetName.trim()) form.set('name', emailAssetName.trim());
      const res = await fetch('/api/admin/email/assets', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Upload fehlgeschlagen'));
      const url = String((data as any)?.url || '');
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Upload OK (URL kopiert)');
        } catch {
          toast.success('Upload OK');
        }
      } else {
        toast.success('Upload OK');
      }
      setEmailAssetName('');
      await refreshEmailAssets();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailAssetUploading(false);
    }
  }

  async function refreshBranding() {
    setBrandingLoading(true);
    try {
      const [logoRes, favRes, iconRes] = await Promise.all([
        fetch('/api/admin/brand/logo', { cache: 'no-store' }),
        fetch('/api/admin/brand/favicon', { cache: 'no-store' }),
        fetch('/api/admin/brand/icon', { cache: 'no-store' }),
      ]);
      const [logoData, favData, iconData] = await Promise.all([
        logoRes.json().catch(() => ({})),
        favRes.json().catch(() => ({})),
        iconRes.json().catch(() => ({})),
      ]);
      if (!logoRes.ok) throw new Error(String((logoData as any)?.error || 'Logo laden fehlgeschlagen'));
      if (!favRes.ok) throw new Error(String((favData as any)?.error || 'Favicon laden fehlgeschlagen'));
      if (!iconRes.ok) throw new Error(String((iconData as any)?.error || 'Icon laden fehlgeschlagen'));

      setBrandingLogo({
        exists: Boolean((logoData as any)?.exists),
        url: String((logoData as any)?.url || '/brand/logo.png'),
        updated_at: (logoData as any)?.updated_at ? String((logoData as any).updated_at) : null,
      });
      setBrandingFavicon({
        exists: Boolean((favData as any)?.exists),
        url: String((favData as any)?.url || '/brand/favicon.png'),
        updated_at: (favData as any)?.updated_at ? String((favData as any).updated_at) : null,
      });
      setBrandingIcon({
        exists: Boolean((iconData as any)?.exists),
        url: String((iconData as any)?.url || '/brand/icon.png'),
        updated_at: (iconData as any)?.updated_at ? String((iconData as any).updated_at) : null,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBrandingLoading(false);
    }
  }

  async function uploadBrandAsset(kind: 'logo' | 'favicon' | 'icon', file: File) {
    setBrandingUploading((prev) => ({ ...prev, [kind]: true }));
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch(`/api/admin/brand/${kind}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Upload fehlgeschlagen'));
      toast.success(kind === 'logo' ? 'Logo aktualisiert' : kind === 'favicon' ? 'Favicon aktualisiert' : 'App Icon aktualisiert');
      await refreshBranding();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBrandingUploading((prev) => ({ ...prev, [kind]: false }));
    }
  }

  async function refreshEmailSettings(verify = false) {
    setEmailLoading(true);
    try {
      const res = await fetch(`/api/admin/email/settings${verify ? '?verify=1' : ''}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Failed to load email settings'));
      setEmailSettings(data as EmailSettingsPayload);
      toast.success(verify ? 'SMTP geprueft' : 'SMTP geladen');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailLoading(false);
    }
  }

  async function saveEmailSettings() {
    setEmailSaving(true);
    try {
      const res = await fetch('/api/admin/email/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_base_url: emailDraft.public_base_url,
          host: emailDraft.host,
          port: emailDraft.port,
          user: emailDraft.user,
          from: emailDraft.from,
          ...(emailDraft.password.trim() ? { password: emailDraft.password } : {}),
          signature_html: emailDraft.signature_html,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Speichern fehlgeschlagen'));
      setEmailDraft((prev) => ({ ...prev, password: '' }));
      await refreshEmailSettings(true);
      toast.success('SMTP gespeichert');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailSaving(false);
    }
  }

  async function sendTestEmail() {
    setEmailTesting(true);
    try {
      const res = await fetch('/api/admin/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTestTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((data as any)?.error || 'Testmail fehlgeschlagen'));
      toast.success('Testmail gesendet');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailTesting(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'access') return;
    if (!rbacMatrix && !rbacLoading) {
      refreshRbacMatrix();
    }
  }, [activeTab, rbacMatrix, rbacLoading]);

  useEffect(() => {
    if (activeTab !== 'system') return;
    if (appAudience === 'customer') return;
    if (!brandingLogo && !brandingLoading) {
      refreshBranding();
    }
  }, [activeTab, appAudience, brandingLogo, brandingLoading]);

  async function loadUsers() {
    if (currentUser?.role !== 'admin') return;
    setUserLoading(true);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUserLoading(false);
    }
  }

  async function loadLoginRequests() {
    if (currentUser?.role !== 'admin') return;
    setRequestLoading(true);
    try {
      const res = await fetch('/api/users/requests', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load login requests');
      const requests = Array.isArray(data.requests) ? data.requests : [];
      setLoginRequests(requests);
      const nextDrafts: Record<string, Role> = {};
      requests.forEach((req: LoginRequestRecord) => {
        nextDrafts[req.email] = req.requested_role || 'viewer';
      });
      setRequestRoleDrafts(nextDrafts);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRequestLoading(false);
    }
  }

  useEffect(() => {
    loadUsers().catch(() => {});
    loadLoginRequests().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.role]);

  if (meResolved && appAudience === 'customer') {
    return <CustomerSettings />;
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync');
      toast.success('Sync completed');
      // Refresh info
      const info = await fetch('/api/settings').then(r => r.json());
      setSyncInfo(info);
    } catch {
      toast.error('Sync failed');
    }
    setSyncing(false);
  }

  async function clearSeeds() {
    if (!confirm('Remove all seed data? Real data will be preserved.')) return;
    setClearing(true);
    try {
      await fetch('/api/seed', { method: 'DELETE' });
      toast.success('Seed data cleared');
      const info = await fetch('/api/settings').then(r => r.json());
      setSyncInfo(info);
    } catch {
      toast.error('Failed to clear seeds');
    }
    setClearing(false);
  }

  async function patchAdminSettings(payload: Record<string, boolean>) {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update setting');
      setAppSettings(data.settings || null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function createUserRecord(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          role: createRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      toast.success('User created');
      setCreateUsername('');
      setCreatePassword('');
      setCreateRole('editor');
      await loadUsers();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function updateRole(id: number, role: Role) {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');
      toast.success('Role updated');
      await loadUsers();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function updatePassword(id: number) {
    const password = (passwordDrafts[id] || '').trim();
    if (!password) return;
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      setPasswordDrafts((prev) => ({ ...prev, [id]: '' }));
      toast.success('Password updated');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeUser(id: number) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      toast.success('User deleted');
      await loadUsers();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reviewLoginRequest(email: string, action: 'approve' | 'deny') {
    try {
      const role = requestRoleDrafts[email] || 'viewer';
      const res = await fetch('/api/users/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} request`);
      toast.success(action === 'approve' ? 'Access approved' : 'Access denied');
      await Promise.all([loadLoginRequests(), loadUsers()]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function savePolicy(instanceId: string) {
    const policy = policies[instanceId];
    if (!policy) return;
    setSavingPolicy(prev => ({ ...prev, [instanceId]: true }));
    try {
      const res = await fetch('/api/memory-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: instanceId, ...policy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save memory policy');
      setPolicies(prev => ({ ...prev, [instanceId]: data.policy }));
      toast.success(`Decay policy saved (${instanceId})`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPolicy(prev => ({ ...prev, [instanceId]: false }));
    }
  }

  async function saveAlertPolicy(instanceId: string) {
    const policy = alertPolicies[instanceId];
    if (!policy) return;
    setSavingAlertPolicy(prev => ({ ...prev, [instanceId]: true }));
    try {
      const res = await fetch('/api/memory-alert-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: instanceId, ...policy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save alert policy');
      setAlertPolicies(prev => ({ ...prev, [instanceId]: data.policy }));
      toast.success(`Alert policy saved (${instanceId})`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingAlertPolicy(prev => ({ ...prev, [instanceId]: false }));
    }
  }

  async function saveTopupOffer(e: React.FormEvent) {
    e.preventDefault();
    setSavingOffer(true);
    try {
      const res = await fetch('/api/admin/topup-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offerDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save topup offer');
      toast.success('Topup offer gespeichert');
      setOfferDraft({
        offerCode: '',
        name: '',
        amountEur: 20,
        credits: 20000,
        bonusCredits: 0,
        active: true,
        sortOrder: 1,
        marketingLabel: '',
      });
      const offersPayload = await fetch('/api/admin/topup-offers', { cache: 'no-store' }).then((r) => r.json());
      setTopupOffers(Array.isArray(offersPayload?.offers) ? offersPayload.offers : []);
      const configPayload = await fetch('/api/billing/config', { cache: 'no-store' }).then((r) => r.json());
      setBillingConfig(configPayload);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingOffer(false);
    }
  }

  async function refreshSchemaStatus() {
    setSchemaLoading(true);
    try {
      const res = await fetch('/api/admin/schema/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Schema status unavailable');
      setSchemaStatus(data);
    } catch (err) {
      toast.error((err as Error).message || 'Schema status unavailable');
      setSchemaStatus(null);
    } finally {
      setSchemaLoading(false);
    }
  }

  async function refreshRbacMatrix() {
    setRbacLoading(true);
    try {
      const res = await fetch('/api/admin/rbac', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'RBAC unavailable');
      const matrix = data?.matrix || data;
      setRbacMatrix(matrix);
    } catch (err) {
      toast.error((err as Error).message || 'RBAC unavailable');
      setRbacMatrix(null);
    } finally {
      setRbacLoading(false);
    }
  }

  async function setRoleCapability(role: Role, capability: string, enabled: boolean | null) {
    try {
      const res = await fetch('/api/admin/rbac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, capability, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'RBAC update failed');
      setRbacMatrix(data?.matrix || null);
    } catch (err) {
      toast.error((err as Error).message || 'RBAC update failed');
    }
  }

  return (
    <div className="space-y-6 animate-in w-full">
      <div className="panel">
        <div className="panel-header">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings size={20} /> Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure sync, memory policies, access controls, and workspace runtime details.
          </p>
        </div>
        <div className="panel-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: 'general', label: 'General' },
              { key: 'memory', label: 'Memory' },
              { key: 'stripe', label: 'Stripe' },
              { key: 'access', label: 'Access' },
              { key: 'system', label: 'System' },
              { key: 'website', label: 'Website' },
              { key: 'about', label: 'About' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key as SettingsTab);
                  if (tab.key === 'system' && !schemaStatus && !schemaLoading) {
                    refreshSchemaStatus();
                  }
                }}
                className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Database Info */}
      {activeTab === 'general' && (
      <>
      <div className="grid gap-4 lg:grid-cols-2">
        <PasskeyManager title="Passkeys (Login ohne Passwort)" />
        <div className="panel">
          <div className="panel-body space-y-2">
            <div className="text-sm font-medium">Hinweis</div>
            <div className="text-xs text-muted-foreground">
              Passkeys sind device-gebunden (z.B. FaceID/TouchID). Du kannst mehrere Passkeys registrieren (Laptop + Smartphone) und jederzeit wieder entfernen.
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Database size={14} className="text-primary" /> Database
        </h2>

        {syncInfo ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">DB Path</span>
                <code className="text-[11px] bg-muted px-2 py-1 rounded block truncate">
                  {syncInfo.db_path}
                </code>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">State Directory</span>
                <code className="text-[11px] bg-muted px-2 py-1 rounded block truncate">
                  {syncInfo.state_dir}
                </code>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Database Size</span>
                <span className="font-mono">{syncInfo.db_size_mb.toFixed(2)} MB</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Seed Records</span>
                <span className="font-mono">{syncInfo.seed_count}</span>
              </div>
            </div>

            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-medium">Admin: Runtime Controls</h3>
              <p className="text-xs text-muted-foreground">
                Schalte kritische Admin-Funktionen gezielt frei. Diese Werte werden lokal im State gespeichert.
              </p>
              <div className="mt-3 grid gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_user_deletion}
                    onChange={(e) => patchAdminSettings({ allow_user_deletion: e.target.checked })}
                  />
                  <span>User-Loeschung erlauben</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_user_registration}
                    onChange={(e) => patchAdminSettings({ allow_user_registration: e.target.checked })}
                  />
                  <span>Self-Registration erlauben</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_policy_write}
                    onChange={(e) => patchAdminSettings({ allow_policy_write: e.target.checked })}
                  />
                  <span>Memory-Policy Write erlauben</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_cron_write}
                    onChange={(e) => patchAdminSettings({ allow_cron_write: e.target.checked })}
                  />
                  <span>Cron-Write erlauben</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_workspace_write}
                    onChange={(e) => patchAdminSettings({ allow_workspace_write: e.target.checked })}
                  />
                  <span>Workspace-Write erlauben</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!appSettings?.allow_stripe_write}
                    onChange={(e) => patchAdminSettings({ allow_stripe_write: e.target.checked })}
                  />
                  <span>Stripe-Write erlauben (Coupons/Promotion Codes)</span>
                </label>
              </div>
            </div>

            {/* Table row counts */}
            <div>
              <span className="text-xs text-muted-foreground block mb-2">Tables</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {syncInfo.tables.map(t => (
                  <div key={t.name} className="bg-muted/30 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-xs">{t.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'website' && (
        <div className="space-y-4">
          <WebsiteFtpSettings />
        </div>
      )}

      {/* Memory Decay Policy */}
      {activeTab === 'memory' && (
      <>
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <BrainCircuit size={14} className="text-info" /> Memory Decay Policy
        </h2>
        <p className="text-xs text-muted-foreground">
          Controls recency decay and prune thresholds for each local workspace instance.
        </p>
        {instances.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading instances...</div>
        ) : instances.map((it) => {
          const ns = it.id;
          const policy = policies[ns];
          return (
            <div key={ns} className="rounded-lg border border-border/40 p-4 space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {it.label} <span className="font-mono text-[10px] opacity-70">({ns})</span>
              </div>
              {policy ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Half-life Days</span>
                      <input
                        type="number"
                        min={7}
                        max={365}
                        value={policy.decay_half_life_days}
                        onChange={(e) => setPolicies(prev => ({ ...prev, [ns]: { ...policy, decay_half_life_days: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Min Effective Confidence</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={policy.min_effective_confidence}
                        onChange={(e) => setPolicies(prev => ({ ...prev, [ns]: { ...policy, min_effective_confidence: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Min Keep Confidence</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={policy.min_keep_confidence}
                        onChange={(e) => setPolicies(prev => ({ ...prev, [ns]: { ...policy, min_keep_confidence: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Low-Confidence Prune Days</span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={policy.low_confidence_prune_days}
                        onChange={(e) => setPolicies(prev => ({ ...prev, [ns]: { ...policy, low_confidence_prune_days: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs text-muted-foreground">Default TTL Days</span>
                      <input
                        type="number"
                        min={7}
                        max={365}
                        value={policy.default_ttl_days}
                        onChange={(e) => setPolicies(prev => ({ ...prev, [ns]: { ...policy, default_ttl_days: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => savePolicy(ns)}
                      disabled={savingPolicy[ns]}
                      className="btn btn-primary text-sm"
                    >
                      {savingPolicy[ns] ? 'Saving...' : `Save ${ns} Policy`}
                    </button>
                    <span className="text-xs text-muted-foreground">Target: {ns} KB-manager cron</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Loading policy...</div>
              )}
            </div>
          );
        })}
      </div>
      </>
      )}

      {activeTab === 'general' && (
      <>
      {/* Sync Controls */}
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <RefreshCw size={14} className="text-success" /> Sync
        </h2>
        <p className="text-xs text-muted-foreground">
          The dashboard syncs 14 JSON state files from the agent workspace into SQLite every 30 seconds.
        </p>
        {syncInfo?.sync_health && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Sync</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono">
                  {syncInfo.sync_health.last_sync_at ? timeAgo(syncInfo.sync_health.last_sync_at) : '—'}
                </span>
                {syncInfo.sync_health.last_sync_status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                    syncInfo.sync_health.last_sync_status === 'ok'
                      ? 'bg-success/15 text-success'
                      : 'bg-destructive/15 text-destructive'
                  }`}>
                    {syncInfo.sync_health.last_sync_status}
                  </span>
                )}
              </div>
              <div className="mt-1 text-muted-foreground">
                Duration: {syncInfo.sync_health.last_sync_duration_ms ?? '—'} ms
              </div>
            </div>
            <div className="rounded-lg border border-border/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Success</div>
              <div className="mt-1 font-mono">
                {syncInfo.sync_health.last_success_at ? timeAgo(syncInfo.sync_health.last_success_at) : '—'}
              </div>
              <div className="mt-1 text-muted-foreground">
                Duration: {syncInfo.sync_health.last_success_duration_ms ?? '—'} ms
              </div>
            </div>
            {syncInfo.sync_health.last_sync_error && (
              <div className="sm:col-span-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Last error: {syncInfo.sync_health.last_sync_error}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="btn btn-primary text-sm flex items-center gap-2"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={clearSeeds}
            disabled={clearing}
            className="btn btn-destructive text-sm flex items-center gap-2"
          >
            <Trash2 size={14} />
            {clearing ? 'Clearing...' : 'Clear Seed Data'}
          </button>
        </div>
      </div>

      {/* Sync File Diagnostics */}
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Database size={14} className="text-info" /> Sync Diagnostics
        </h2>
        {syncInfo?.sync_files && syncInfo.sync_files.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2 pr-2">File</th>
                  <th className="text-left py-2 pr-2">Last Seen</th>
                  <th className="text-left py-2 pr-2">File MTime</th>
                  <th className="text-left py-2 pr-2">Size</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {syncInfo.sync_files.map(file => (
                  <tr key={file.filename} className="border-b border-border/20">
                    <td className="py-2 pr-2 font-mono">{file.filename}</td>
                    <td className="py-2 pr-2">{file.last_seen_at ? timeAgo(file.last_seen_at) : '—'}</td>
                    <td className="py-2 pr-2">{file.last_mtime ? timeAgo(file.last_mtime) : '—'}</td>
                    <td className="py-2 pr-2 font-mono">
                      {typeof file.size_bytes === 'number' ? `${Math.round(file.size_bytes / 1024)} KB` : '—'}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                        file.last_status === 'ok'
                          ? 'bg-success/15 text-success'
                          : file.last_status === 'missing'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-destructive/15 text-destructive'
                      }`}>
                        {file.last_status || 'unknown'}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">{file.last_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No sync file telemetry yet.</div>
        )}
      </div>

      {/* Agent Configuration */}
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Shield size={14} className="text-warning" /> Agent Configuration
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Instances</span>
            <span className="font-mono">{instances.length}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Agent Discovery</span>
            <span>Dynamic (from each instance workspace config)</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Notes</span>
            <span className="text-muted-foreground">
              Models, local workspaces, and cron wiring are defined by your Nexora runtime config.
            </span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Memory Alert Thresholds */}
      {activeTab === 'memory' && (
      <>
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <BellRing size={14} className="text-warning" /> Memory Alert Thresholds
        </h2>
        <p className="text-xs text-muted-foreground">
          Controls thresholds used by memory drift alerts (hourly + weekly jobs).
        </p>
        {instances.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading instances...</div>
        ) : instances.map((it) => {
          const ns = it.id;
          const policy = alertPolicies[ns];
          return (
            <div key={ns} className="rounded-lg border border-border/40 p-4 space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {it.label} <span className="font-mono text-[10px] opacity-70">({ns})</span>
              </div>
              {policy ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Window Days</span>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={policy.window_days}
                        onChange={(e) => setAlertPolicies(prev => ({ ...prev, [ns]: { ...policy, window_days: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Contradiction Threshold</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={policy.alert_contradictions_threshold}
                        onChange={(e) => setAlertPolicies(prev => ({ ...prev, [ns]: { ...policy, alert_contradictions_threshold: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Duplicate Threshold</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={policy.alert_duplicates_threshold}
                        onChange={(e) => setAlertPolicies(prev => ({ ...prev, [ns]: { ...policy, alert_duplicates_threshold: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Weak-Agent Threshold</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={policy.alert_weak_agents_threshold}
                        onChange={(e) => setAlertPolicies(prev => ({ ...prev, [ns]: { ...policy, alert_weak_agents_threshold: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs text-muted-foreground">Never-Accessed Ratio Threshold</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={policy.alert_never_ratio_threshold}
                        onChange={(e) => setAlertPolicies(prev => ({ ...prev, [ns]: { ...policy, alert_never_ratio_threshold: Number(e.target.value) } }))}
                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => saveAlertPolicy(ns)}
                      disabled={savingAlertPolicy[ns]}
                      className="btn btn-primary text-sm"
                    >
                      {savingAlertPolicy[ns] ? 'Saving...' : `Save ${ns} Alert Policy`}
                    </button>
                    <span className="text-xs text-muted-foreground">Target: {ns} memory-drift cron</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Loading policy...</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Policy Effect */}
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <BrainCircuit size={14} className="text-primary" /> Policy Effect
        </h2>
        {instances.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading instances...</div>
        ) : (
          <div className="space-y-3">
            {instances.map((it) => {
              const memoryEffect = memoryEffects[it.id];
              return (
                <div key={it.id} className="rounded-lg border border-border/40 p-4 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {it.label} <span className="font-mono text-[10px] opacity-70">({it.id})</span>
                  </div>
                  {!memoryEffect ? (
                    <div className="text-sm text-muted-foreground">Loading policy effect...</div>
                  ) : !memoryEffect.available || !memoryEffect.deltas ? (
                    <div className="text-xs text-muted-foreground">
                      Not enough history yet ({memoryEffect.history_points ?? 0} drift points, {memoryEffect.policy_changes ?? 0} policy changes).
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-muted-foreground">
                        Baseline: {memoryEffect.baseline_at} · Current: {memoryEffect.current_at}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <MetricDelta label="Contradictions" value={memoryEffect.deltas.contradictions} inverse />
                        <MetricDelta label="Duplicates" value={memoryEffect.deltas.duplicates} inverse />
                        <MetricDelta label="Weak Agents" value={memoryEffect.deltas.weak_agents} inverse />
                        <MetricDelta label="Hot Memory" value={memoryEffect.deltas.hot_memory} />
                        <MetricDelta
                          label="Never Accessed Ratio"
                          value={memoryEffect.deltas.never_accessed_ratio}
                          percent
                          inverse
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'stripe' && (
      <>
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <CreditCard size={14} className="text-primary" /> Stripe Konfiguration
        </h2>
        <p className="text-xs text-muted-foreground">
          Status, URLs und Angebotskonfiguration fuer Checkout, Wallet und Webhooks. Geheimnisse bleiben serverseitig in der .env.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <StatusTile label="Secret Key" value={billingConfig?.stripe_secret_configured ? 'Verbunden' : 'Fehlt'} ok={Boolean(billingConfig?.stripe_secret_configured)} icon={<KeyRound size={14} />} />
          <StatusTile label="Webhook" value={billingConfig?.stripe_webhook_configured ? 'Konfiguriert' : 'Fehlt'} ok={Boolean(billingConfig?.stripe_webhook_configured)} icon={<Webhook size={14} />} />
          <StatusTile label="Modus" value={billingConfig?.billing_mode === 'live-or-test' ? 'Stripe aktiv' : 'Dev-Modus'} ok={billingConfig?.billing_mode === 'live-or-test'} icon={<CreditCard size={14} />} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <ConfigBlock label="PUBLIC_BASE_URL" value={billingConfig?.public_base_url || 'nicht gesetzt'} />
          <ConfigBlock label="Webhook URL" value={billingConfig?.webhook_url || billingConfig?.webhook_path || '/api/billing/webhook'} />
          <ConfigBlock label="Success URL" value={billingConfig?.success_url || 'nicht gesetzt'} />
          <ConfigBlock label="Cancel URL" value={billingConfig?.cancel_url || 'nicht gesetzt'} />
        </div>

        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-xs text-muted-foreground">
          STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET werden bewusst nicht im Browser bearbeitet. Diese Seite zeigt Status, Ziel-URLs und Angebotsdaten. Die eigentlichen Secrets bleiben auf dem Server.
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Database size={14} className="text-success" /> Topup Offers
        </h2>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
          Die ersten vier aktiven Offers nach Sortierung steuern die festen Checkout-Betraege fuer Kunden und Onboarding. Mit `Sortierung` legst du fest, welche vier Buttons zuerst erscheinen.
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {topupOffers.slice().sort((left, right) => (Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)) || (Number(left.amountEur ?? 0) - Number(right.amountEur ?? 0))).slice(0, 4).map((offer, index) => (
            <div key={`checkout-slot-${offer.offerCode}`} className="rounded-xl border border-border/40 bg-muted/10 p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Checkout Slot {index + 1}</div>
              <div className="mt-2 text-lg font-semibold">€{Number(offer.amountEur ?? 0).toFixed(0)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{offer.offerCode} · {offer.marketingLabel || offer.name}</div>
            </div>
          ))}
        </div>

        <form onSubmit={saveTopupOffer} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            value={offerDraft.offerCode}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, offerCode: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="offerCode"
            required
          />
          <input
            value={offerDraft.name}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, name: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Name"
            required
          />
          <input
            type="number"
            min={1}
            step="0.01"
            value={offerDraft.amountEur}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, amountEur: Number(e.target.value) }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Betrag EUR"
            required
          />
          <input
            type="number"
            min={0}
            value={offerDraft.credits}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, credits: Number(e.target.value) }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Credits"
            required
          />
          <input
            type="number"
            min={0}
            value={offerDraft.bonusCredits}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, bonusCredits: Number(e.target.value) }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Bonus Credits"
          />
          <input
            type="number"
            min={1}
            value={offerDraft.sortOrder}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Sortierung"
          />
          <input
            value={offerDraft.marketingLabel || ''}
            onChange={(e) => setOfferDraft((prev) => ({ ...prev, marketingLabel: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Marketing Label"
          />
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={offerDraft.active}
              onChange={(e) => setOfferDraft((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Aktiv
          </label>
          <button type="submit" disabled={savingOffer} className="btn btn-primary text-sm md:col-span-2 xl:col-span-4">
            {savingOffer ? 'Speichert...' : 'Offer speichern und Checkout aktualisieren'}
          </button>
        </form>

        <div className="grid gap-3">
          {topupOffers.length === 0 ? (
            <div className="rounded-xl border border-border/40 p-4 text-sm text-muted-foreground bg-muted/10">
              Noch keine Topup Offers geladen.
            </div>
          ) : topupOffers.map((offer) => (
            <div key={offer.offerCode} className="rounded-xl border border-border/40 p-4 bg-muted/10 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-medium">{offer.name}</div>
                <div className="text-xs text-muted-foreground">{offer.offerCode} · {offer.marketingLabel || 'ohne Label'}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>€{Number(offer.amountEur ?? 0).toFixed(2)} · {Number(offer.credits ?? 0)} Credits</div>
                <div>Bonus {Number(offer.bonusCredits ?? 0)} · Sort {Number(offer.sortOrder ?? 0)} · {offer.active ? 'aktiv' : 'inaktiv'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}

      {/* Users & Roles */}
      {activeTab === 'access' && (
      <div className="panel p-5 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Users size={14} className="text-primary" /> Users & Roles
        </h2>
        {currentUser?.role !== 'admin' ? (
          <p className="text-xs text-muted-foreground">
            Admin access required to manage users and roles.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border/40 p-4 space-y-3 bg-muted/10">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Login Requests
                </div>
                <button
                  type="button"
                  className="btn text-xs px-2 py-1"
                  onClick={() => loadLoginRequests()}
                  disabled={requestLoading}
                >
                  {requestLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {requestLoading ? (
                <p className="text-xs text-muted-foreground">Loading login requests...</p>
              ) : loginRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No login requests yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {loginRequests.map((req) => (
                    <div key={req.email} className="rounded-lg border border-border/50 bg-muted/5 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{req.email}</div>
                          <div className="text-xs text-muted-foreground">
                            status: {req.status} • attempts: {req.attempts}
                          </div>
                          {req.status === 'pending' && req.last_error ? (
                            <div className="text-xs text-warning truncate">last error: {req.last_error}</div>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(req.last_attempt_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <select
                          value={requestRoleDrafts[req.email] || req.requested_role}
                          onChange={(e) => setRequestRoleDrafts((prev) => ({ ...prev, [req.email]: e.target.value as Role }))}
                          className="px-2 py-1 rounded-md border border-border bg-background text-xs"
                        >
                          <option value="admin">admin</option>
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary text-xs px-2 py-1"
                          onClick={() => reviewLoginRequest(req.email, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-destructive text-xs px-2 py-1"
                          onClick={() => reviewLoginRequest(req.email, 'deny')}
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/40 p-4 space-y-3 bg-muted/10">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Create User</div>
              <form onSubmit={createUserRecord} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  placeholder="username"
                  required
                />
                <input
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  placeholder="password (min 10 chars)"
                  type="password"
                  required
                />
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as Role)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                <button type="submit" disabled={createSubmitting} className="btn btn-primary text-sm flex items-center justify-center gap-2">
                  <UserPlus size={14} /> {createSubmitting ? 'Creating...' : 'Create User'}
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-border/40 p-4 space-y-3 bg-muted/10">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role Matrix</div>
              {rbacLoading ? (
                <div className="text-xs text-muted-foreground">Loading RBAC…</div>
              ) : !rbacMatrix ? (
                <div className="text-xs text-muted-foreground">RBAC matrix unavailable.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/40">
                        <th className="text-left py-2 pr-2">Capability</th>
                        {rbacMatrix.roles.map((role) => (
                          <th key={role} className="text-left py-2 pr-2 capitalize">{role}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rbacMatrix.capabilities
                        .slice()
                        .sort((a, b) => `${a.group || ''}:${a.label}`.localeCompare(`${b.group || ''}:${b.label}`))
                        .map((cap) => (
                          <tr key={cap.key} className="border-b border-border/20 align-top">
                            <td className="py-2 pr-2">
                              <div className="font-medium">{cap.label}</div>
                              <div className="text-[10px] text-muted-foreground">{cap.group || '—'}</div>
                            </td>
                            {rbacMatrix.roles.map((role) => {
                              const effective = (rbacMatrix.roleCapabilities?.[role] || []).includes(cap.key);
                              const override = rbacMatrix.roleOverrides?.[role]?.[cap.key] ?? null;
                              return (
                                <td key={`${role}-${cap.key}`} className="py-2 pr-2">
                                  <div className="flex items-center gap-2">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={effective}
                                        onChange={(e) => setRoleCapability(role, cap.key, e.target.checked)}
                                      />
                                      <span className={`text-[10px] ${override === null ? 'text-muted-foreground' : 'text-primary'}`}>
                                        {override === null ? 'default' : 'override'}
                                      </span>
                                    </label>
                                    {override !== null ? (
                                      <button
                                        type="button"
                                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                        onClick={() => setRoleCapability(role, cap.key, null)}
                                      >
                                        reset
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {userLoading ? (
              <p className="text-xs text-muted-foreground">Loading users...</p>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="rounded-xl border border-border/50 p-3 space-y-3 bg-muted/5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{user.username}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user.email || 'No email'} • {user.auth_provider || 'local'}
                        </div>
                      </div>
                      <select
                        value={user.role}
                        onChange={(e) => updateRole(user.id, e.target.value as Role)}
                        className="px-2 py-1 rounded-md border border-border bg-background text-xs"
                      >
                        <option value="admin">admin</option>
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={passwordDrafts[user.id] || ''}
                        onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        className="px-2 py-1 rounded-md border border-border bg-background text-xs flex-1 min-w-[180px]"
                        placeholder="new password"
                        type="password"
                      />
                      <button
                        onClick={() => updatePassword(user.id)}
                        type="button"
                        className="btn text-xs px-2 py-1 flex items-center gap-1"
                      >
                        <KeyRound size={12} /> Set Password
                      </button>
                      <button
                        onClick={() => removeUser(user.id)}
                        type="button"
                        className="btn btn-destructive text-xs px-2 py-1 flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* System */}
      {activeTab === 'system' && (
      <>
      <div className="panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Database size={14} className="text-primary" /> System / Schema
          </h2>
          <button
            type="button"
            onClick={() => refreshSchemaStatus()}
            className="btn text-xs px-2 py-1 flex items-center gap-1"
            disabled={schemaLoading}
          >
            <RefreshCw size={12} className={schemaLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {!schemaStatus ? (
          <div className="text-xs text-muted-foreground">{schemaLoading ? 'Loading…' : 'No schema status loaded yet.'}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">SQLite</div>
              <div className="text-xs space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Path</span>
                  <code className="text-[10px] bg-muted px-2 py-1 rounded max-w-[70%] truncate">{schemaStatus.sqlite.path}</code>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-mono">{schemaStatus.sqlite.size_bytes ? `${Math.round(schemaStatus.sqlite.size_bytes / 1024 / 1024)} MB` : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono">{schemaStatus.sqlite.sqlite_version || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Tables</span>
                  <span className="font-mono">{schemaStatus.sqlite?.tables?.length ?? 0}</span>
                </div>
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border/50 bg-background/50 p-2 text-[11px]">
                {(schemaStatus.sqlite?.tables ?? []).map((t) => (
                  <div key={t.name} className="flex items-center justify-between gap-3 py-1 border-b border-border/30 last:border-b-0">
                    <span className="font-mono">{t.name}</span>
                    <span className="text-muted-foreground">{typeof t.count === 'number' ? t.count : '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Billing DB</div>
              <div className="text-xs space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Configured</span>
                  <span className="font-mono">{schemaStatus.billing.configured ? 'yes' : 'no'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Kind</span>
                  <span className="font-mono">{schemaStatus.billing.kind || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Applied</span>
                  <span className="font-mono">{schemaStatus.billing?.schema_migrations_applied?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-mono">{schemaStatus.billing?.schema_migrations_pending?.length ?? 0}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-background/50 p-2 text-[11px] max-h-44 overflow-auto">
                  <div className="text-[10px] text-muted-foreground font-semibold mb-2">Applied</div>
                  {(schemaStatus.billing?.schema_migrations_applied ?? []).length ? (schemaStatus.billing?.schema_migrations_applied ?? []).map((v) => (
                    <div key={v} className="font-mono py-0.5">{v}</div>
                  )) : <div className="text-muted-foreground">—</div>}
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-2 text-[11px] max-h-44 overflow-auto">
                  <div className="text-[10px] text-muted-foreground font-semibold mb-2">Pending</div>
                  {(schemaStatus.billing?.schema_migrations_pending ?? []).length ? (schemaStatus.billing?.schema_migrations_pending ?? []).map((v) => (
                    <div key={v} className="font-mono text-warning py-0.5">{v}</div>
                  )) : <div className="text-muted-foreground">—</div>}
                </div>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">Last check: {new Date(schemaStatus.checked_at).toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <BellRing size={14} className="text-primary" /> Branding / Logo
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshBranding()}
              className="btn text-xs px-2 py-1 flex items-center gap-1"
              disabled={brandingLoading}
            >
              <RefreshCw size={12} className={brandingLoading ? 'animate-spin' : ''} /> Laden
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs px-2 py-1"
              disabled={brandingLoading}
              onClick={async () => {
                try {
                  const res = await fetch('/api/admin/brand/logo', { method: 'DELETE' });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(String((data as any)?.error || 'Reset fehlgeschlagen'));
                  toast.success('Logo zurückgesetzt');
                  await refreshBranding();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Status: {brandingLogo?.exists ? <span className="text-success font-semibold">custom</span> : <span className="text-muted-foreground font-semibold">default</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Logo (UI)</div>
            <div className="text-[11px] text-muted-foreground">PNG, transparent empfohlen (512×512).</div>
            <input
              type="file"
              accept="image/png"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              disabled={brandingUploading.logo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBrandAsset('logo', f);
                e.target.value = '';
              }}
            />
            {brandingLogo?.updated_at ? (
              <div className="text-[11px] text-muted-foreground">
                Letztes Update: {new Date(brandingLogo.updated_at).toLocaleString()}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Favicon</div>
                <div className="text-[11px] text-muted-foreground">PNG (empfohlen 256×256), wird für Browser-Tab genutzt.</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-xs px-2 py-1"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/brand/favicon', { method: 'DELETE' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(String((data as any)?.error || 'Reset fehlgeschlagen'));
                    toast.success('Favicon zurückgesetzt');
                    await refreshBranding();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Reset
              </button>
            </div>
            <input
              type="file"
              accept="image/png"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              disabled={brandingUploading.favicon}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBrandAsset('favicon', f);
                e.target.value = '';
              }}
            />
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4 flex items-center justify-center">
              <img
                src={brandingFavicon?.url ? `${brandingFavicon.url}${brandingFavicon.updated_at ? `?v=${encodeURIComponent(brandingFavicon.updated_at)}` : ''}` : '/brand/favicon.png'}
                alt="Favicon"
                className="h-10 w-10 object-contain"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">App Icon</div>
                <div className="text-[11px] text-muted-foreground">PNG 512×512 (maskable), für PWA/Apps.</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-xs px-2 py-1"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/brand/icon', { method: 'DELETE' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(String((data as any)?.error || 'Reset fehlgeschlagen'));
                    toast.success('App Icon zurückgesetzt');
                    await refreshBranding();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Reset
              </button>
            </div>
            <input
              type="file"
              accept="image/png"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              disabled={brandingUploading.icon}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBrandAsset('icon', f);
                e.target.value = '';
              }}
            />
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4 flex items-center justify-center">
              <img
                src={brandingIcon?.url ? `${brandingIcon.url}${brandingIcon.updated_at ? `?v=${encodeURIComponent(brandingIcon.updated_at)}` : ''}` : '/brand/icon.png'}
                alt="App Icon"
                className="h-16 w-16 object-contain"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Tipp: Wenn iOS cached, PWA löschen/neu hinzufügen.
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Webhook size={14} className="text-primary" /> SMTP / E-Mail
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshEmailSettings(false)}
              className="btn text-xs px-2 py-1 flex items-center gap-1"
              disabled={emailLoading}
            >
              <RefreshCw size={12} className={emailLoading ? 'animate-spin' : ''} /> Laden
            </button>
            <button
              type="button"
              onClick={() => refreshEmailSettings(true)}
              className="btn text-xs px-2 py-1 flex items-center gap-1"
              disabled={emailLoading}
            >
              <Shield size={12} /> Pruefen
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Status: {emailSettings?.status?.configured ? <span className="text-success font-semibold">configured</span> : <span className="text-warning font-semibold">not configured</span>}
          {emailSettings?.transport ? (
            <span className="ml-2">
              · Transport: {emailSettings.transport.ok ? <span className="text-success">ok</span> : <span className="text-warning">fail</span>}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Public Base URL</div>
                <input
                  value={emailDraft.public_base_url}
                  onChange={(e) => setEmailDraft((prev) => ({ ...prev, public_base_url: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                  placeholder="https://dashboard.aikitz.at"
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">From</div>
                <input
                  value={emailDraft.from}
                  onChange={(e) => setEmailDraft((prev) => ({ ...prev, from: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                  placeholder="noreply@..."
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Host</div>
                <input
                  value={emailDraft.host}
                  onChange={(e) => setEmailDraft((prev) => ({ ...prev, host: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                  placeholder="smtp.example.com"
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Port</div>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={emailDraft.port}
                  onChange={(e) => setEmailDraft((prev) => ({ ...prev, port: Number(e.target.value) || 587 }))}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">User</div>
                <input
                  value={emailDraft.user}
                  onChange={(e) => setEmailDraft((prev) => ({ ...prev, user: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                  placeholder="smtp-user"
                />
              </label>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Password</div>
                    <input
                      type="password"
                      value={emailDraft.password}
                      onChange={(e) => setEmailDraft((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      placeholder={emailSettings?.status?.has_password ? '•••••••• (gesetzt)' : 'setzen…'}
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <div className="text-xs text-muted-foreground">Signature (HTML)</div>
                    <textarea
                      value={emailDraft.signature_html}
                      onChange={(e) => setEmailDraft((prev) => ({ ...prev, signature_html: e.target.value }))}
                      className="w-full min-h-[140px] rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-mono"
                      placeholder={emailSettings?.status?.signature_configured ? 'Signature ist gesetzt (du kannst sie hier ueberschreiben)…' : 'HTML Signature einfuegen…'}
                    />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Hinweis: `blob:`-Bild-URLs aus Webmail funktionieren beim Empfaenger nicht. Nutze absolute `https://` Links oder entferne Bilder.
                    </div>
                  </label>
                </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => saveEmailSettings()}
                disabled={emailSaving}
              >
                {emailSaving ? 'Speichert…' : 'Speichern'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/email/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clear_password: true }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(String((data as any)?.error || 'Clear fehlgeschlagen'));
                    await refreshEmailSettings(false);
                    toast.success('Passwort entfernt');
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Passwort loeschen
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/email/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clear_signature: true }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(String((data as any)?.error || 'Clear fehlgeschlagen'));
                    setEmailDraft((prev) => ({ ...prev, signature_html: '' }));
                    await refreshEmailSettings(false);
                    toast.success('Signature entfernt');
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Signature loeschen
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Test</div>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Empfaenger</div>
              <input
                value={emailTestTo}
                onChange={(e) => setEmailTestTo(e.target.value)}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                placeholder="dein.email@..."
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => sendTestEmail()}
                disabled={emailTesting || !emailTestTo.trim()}
              >
                {emailTesting ? 'Sende…' : 'Testmail senden'}
              </button>
            </div>
            {emailSettings?.transport && !emailSettings.transport.ok && emailSettings.transport.detail ? (
              <div className="text-xs text-warning break-words">
                Transport Fehler: {emailSettings.transport.detail}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Assets</div>
              <button
                type="button"
                className="btn text-xs px-2 py-1 flex items-center gap-1"
                onClick={() => refreshEmailAssets()}
                disabled={emailAssetsLoading}
              >
                <RefreshCw size={12} className={emailAssetsLoading ? 'animate-spin' : ''} /> Laden
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Bilder hochladen und dann in der Signature als `https://.../email-assets/...` verwenden.
            </div>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Name (optional)</div>
              <input
                value={emailAssetName}
                onChange={(e) => setEmailAssetName(e.target.value)}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                placeholder="logo-aikitz"
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">Upload</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                disabled={emailAssetUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadEmailAsset(f);
                  e.target.value = '';
                }}
              />
            </label>
            {emailAssets.length ? (
              <div className="space-y-1 max-h-40 overflow-auto rounded-lg border border-border/50 bg-background/40 p-2">
                {emailAssets.map((a) => (
                  <div key={a.name} className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-mono">{a.name}</div>
                    <div className="flex items-center gap-2">
                      <a className="text-xs text-primary hover:underline flex items-center gap-1" href={a.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> Open
                      </a>
                      <button
                        type="button"
                        className="btn text-xs px-2 py-1"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(a.url);
                            toast.success('URL kopiert');
                          } catch {
                            toast.error('Kopieren fehlgeschlagen');
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Noch keine Assets geladen.</div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* About */}
      {activeTab === 'about' && (
      <>
      <div className="panel p-5 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Info size={14} className="text-info" /> About
        </h2>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Dashboard</span>
            <span>Nexora v{dashboardVersion}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Runtime</span>
            <span>Next.js 16 + SQLite (WAL)</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Agent Platform</span>
            <span>Local-first runtime</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">License</span>
            <span>MIT</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Source</span>
            <a
              href="https://github.com/kitz-labs/dashboard_template"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              GitHub <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="panel p-5 space-y-3">
        <h2 className="text-sm font-medium">Keyboard Shortcuts</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['⌘K', 'Command palette / search'],
            ['⌘.', 'Toggle live feed'],
            ['Esc', 'Close dialogs'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center gap-3 py-1">
              <kbd className="bg-muted px-2 py-0.5 rounded font-mono text-[11px] min-w-[32px] text-center">
                {key}
              </kbd>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function MetricDelta({
  label,
  value,
  percent = false,
  inverse = false,
}: {
  label: string;
  value: { before: number; after: number; delta: number };
  percent?: boolean;
  inverse?: boolean;
}) {
  const good = inverse ? value.delta <= 0 : value.delta >= 0;
  const cls = good ? 'text-success' : 'text-warning';
  const fmt = (n: number) => (percent ? `${(n * 100).toFixed(1)}%` : `${n}`);
  const deltaPrefix = value.delta > 0 ? '+' : '';
  return (
    <div className="bg-muted/30 rounded p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono">
        {fmt(value.before)} → {fmt(value.after)}{' '}
        <span className={cls}>({deltaPrefix}{fmt(value.delta)})</span>
      </div>
    </div>
  );
}

function StatusTile({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`badge border ${ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function ConfigBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 p-3 bg-muted/10">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-mono">{value}</div>
    </div>
  );
}
