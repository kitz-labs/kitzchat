export type IntegrationCategory =
  | 'documents'
  | 'google'
  | 'commerce'
  | 'cms'
  | 'storage'
  | 'messaging'
  | 'crm'
  | 'finance'
  | 'productivity'
  | 'developer';

export type CustomerIntegrationProfile = {
  id: string;
  provider: string;
  label: string;
  accountIdentifier: string;
  baseUrl: string;
  apiKey: string;
  accessToken: string;
  refreshToken: string;
  username: string;
  password: string;
  notes: string;
  connected: boolean;
};

export type IntegrationProviderDefinition = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  credentialHint: string;
  popular: boolean;
  agentIds: string[];
};

export const INTEGRATION_CATALOG: IntegrationProviderDefinition[] = [
  {
    id: 'notion',
    name: 'Notion',
    category: 'documents',
    description: 'Wissensdatenbanken, Seiten und interne Doku.',
    credentialHint: 'Integration-Token oder API-Key',
    popular: true,
    agentIds: ['athena', 'kb-manager', 'docu-agent', 'main'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'google',
    description: 'Dateien, Ordner und geteilte Ablagen.',
    credentialHint: 'OAuth-Token oder Service-Account',
    popular: true,
    agentIds: ['docu-agent', 'athena', 'kb-manager'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'google',
    description: 'Termine, Slots und Kalenderautomationen.',
    credentialHint: 'OAuth-Token',
    popular: true,
    agentIds: ['main', 'support-concierge', 'apollo'],
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    category: 'google',
    description: 'Tabellen, Reporting und operative Listen.',
    credentialHint: 'OAuth-Token oder Service-Account',
    popular: true,
    agentIds: ['metis', 'athena', 'apollo', 'marketing'],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    category: 'google',
    description: 'Traffic-, Kanal- und Conversion-Daten.',
    credentialHint: 'Measurement-API oder OAuth-Token',
    popular: true,
    agentIds: ['metis', 'marketing', 'campaign-studio'],
  },
  {
    id: 'booking-com',
    name: 'Booking.com',
    category: 'commerce',
    description: 'Buchungen, Verfuegbarkeiten und Gastkommunikation.',
    credentialHint: 'Partner-API-Key oder Zugangsdaten',
    popular: true,
    agentIds: ['support-concierge', 'main', 'athena'],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'cms',
    description: 'Content, Seiten, Blogposts und Publishing.',
    credentialHint: 'REST API Passwort oder Token',
    popular: true,
    agentIds: ['marketing', 'campaign-studio', 'docu-agent'],
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    category: 'commerce',
    description: 'Shop-Produkte, Bestellungen und Umsatzdaten.',
    credentialHint: 'Consumer Key und Secret',
    popular: true,
    agentIds: ['metis', 'apollo', 'support-concierge', 'marketing'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    description: 'Produkte, Bestellungen und Store-Performance.',
    credentialHint: 'Admin API Access Token',
    popular: true,
    agentIds: ['metis', 'apollo', 'marketing', 'support-concierge'],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    category: 'storage',
    description: 'Ablage, Freigaben und Dateizugriffe.',
    credentialHint: 'Access-Token',
    popular: true,
    agentIds: ['docu-agent', 'kb-manager', 'athena'],
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    category: 'storage',
    description: 'Microsoft-Dateiablage fuer Teams und Kundenfiles.',
    credentialHint: 'OAuth-Token',
    popular: true,
    agentIds: ['docu-agent', 'kb-manager', 'main'],
  },
  {
    id: 'whatsapp-business',
    name: 'WhatsApp Business',
    category: 'messaging',
    description: 'Support- und Verkaufsnachrichten ueber WhatsApp.',
    credentialHint: 'Phone ID und Access-Token',
    popular: true,
    agentIds: ['support-concierge', 'apollo', 'main'],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'messaging',
    description: 'Interne Abstimmung, Channel-Updates und Alerts.',
    credentialHint: 'Bot Token',
    popular: true,
    agentIds: ['main', 'kb-manager', 'metis', 'support-concierge'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    description: 'Kontakte, Deals und Sales-Pipeline.',
    credentialHint: 'Private App Token',
    popular: true,
    agentIds: ['apollo', 'support-concierge', 'main'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'crm',
    description: 'Enterprise-CRM fuer Accounts, Cases und Opportunities.',
    credentialHint: 'Connected App Token',
    popular: true,
    agentIds: ['apollo', 'support-concierge', 'main'],
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    category: 'crm',
    description: 'Leads und Deal-Phasen fuer Sales-Automation.',
    credentialHint: 'API-Key',
    popular: true,
    agentIds: ['apollo', 'main'],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    category: 'productivity',
    description: 'Leichte Datenbanken, Listen und operative Workflows.',
    credentialHint: 'Personal Access Token',
    popular: true,
    agentIds: ['athena', 'metis', 'apollo', 'marketing'],
  },
  {
    id: 'trello',
    name: 'Trello',
    category: 'productivity',
    description: 'Boards, Karten und einfache Teamplanung.',
    credentialHint: 'API-Key und Token',
    popular: true,
    agentIds: ['main', 'campaign-studio', 'kb-manager'],
  },
  {
    id: 'asana',
    name: 'Asana',
    category: 'productivity',
    description: 'Projektplanung, Aufgaben und Statusupdates.',
    credentialHint: 'Personal Access Token',
    popular: true,
    agentIds: ['main', 'campaign-studio', 'kb-manager'],
  },
  {
    id: 'monday',
    name: 'monday.com',
    category: 'productivity',
    description: 'Boards, Pipelines und operative Statusfuehrung.',
    credentialHint: 'API-Token',
    popular: true,
    agentIds: ['main', 'campaign-studio', 'apollo'],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    category: 'messaging',
    description: 'Tickets, Supporthistorie und Antwortvorlagen.',
    credentialHint: 'API-Token',
    popular: true,
    agentIds: ['support-concierge', 'main'],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    category: 'messaging',
    description: 'Inbox, Conversations und Kundenkommunikation.',
    credentialHint: 'Access-Token',
    popular: true,
    agentIds: ['support-concierge', 'apollo'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'finance',
    description: 'Zahlungen, Rechnungen und Umsatzsignale.',
    credentialHint: 'Secret Key',
    popular: true,
    agentIds: ['metis', 'support-concierge', 'apollo'],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'finance',
    description: 'Zahlungen, Payouts und Umsatzdaten.',
    credentialHint: 'Client ID und Secret',
    popular: true,
    agentIds: ['metis', 'support-concierge'],
  },
  {
    id: 'xero',
    name: 'Xero',
    category: 'finance',
    description: 'Buchhaltung, Rechnungen und Kontenbewegungen.',
    credentialHint: 'OAuth-Token',
    popular: true,
    agentIds: ['metis', 'main'],
  },
  {
    id: 'datev',
    name: 'DATEV',
    category: 'finance',
    description: 'Steuer- und Buchhaltungsanbindung fuer DACH-Setups.',
    credentialHint: 'Mandanten- oder API-Zugang',
    popular: true,
    agentIds: ['metis', 'main'],
  },
  {
    id: 'finapi',
    name: 'finAPI',
    category: 'finance',
    description: 'Banking- und Kontodaten ueber Open-Banking-Schnittstellen.',
    credentialHint: 'Client ID und Secret',
    popular: true,
    agentIds: ['metis', 'main'],
  },
  {
    id: 'n26',
    name: 'N26 Business',
    category: 'finance',
    description: 'Business-Kontoauszuege und Zahlungsverlaeufe.',
    credentialHint: 'API-Zugang oder Banking-Token',
    popular: false,
    agentIds: ['metis', 'main'],
  },
  {
    id: 'revolut-business',
    name: 'Revolut Business',
    category: 'finance',
    description: 'Kontobewegungen, Karten und Multi-Currency-Reports.',
    credentialHint: 'Business API Token',
    popular: true,
    agentIds: ['metis', 'main'],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'developer',
    description: 'Repos, Issues, Pull Requests und Releases.',
    credentialHint: 'Personal Access Token',
    popular: true,
    agentIds: ['codepilot', 'athena', 'main'],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    category: 'developer',
    description: 'Repos, Pipelines und Merge Requests.',
    credentialHint: 'Access-Token',
    popular: false,
    agentIds: ['codepilot', 'main'],
  },
];

export function getIntegrationProvider(id: string): IntegrationProviderDefinition | undefined {
  return INTEGRATION_CATALOG.find((provider) => provider.id === id);
}

export function isIntegrationProfileConnected(profile: Omit<CustomerIntegrationProfile, 'connected'> | CustomerIntegrationProfile): boolean {
  return Boolean(
    profile.apiKey.trim() ||
      profile.accessToken.trim() ||
      profile.refreshToken.trim() ||
      (profile.username.trim() && profile.password.trim()) ||
      (profile.baseUrl.trim() && profile.accountIdentifier.trim()),
  );
}

export function sanitizeIntegrationProfile(profile: Partial<CustomerIntegrationProfile>, index = 0): CustomerIntegrationProfile {
  const provider = typeof profile.provider === 'string' ? profile.provider.trim() : '';
  const label = typeof profile.label === 'string' && profile.label.trim()
    ? profile.label.trim()
    : getIntegrationProvider(provider)?.name || `Integration ${index + 1}`;
  const sanitized: CustomerIntegrationProfile = {
    id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : `integration-${index + 1}`,
    provider,
    label,
    accountIdentifier: typeof profile.accountIdentifier === 'string' ? profile.accountIdentifier.trim() : '',
    baseUrl: typeof profile.baseUrl === 'string' ? profile.baseUrl.trim() : '',
    apiKey: typeof profile.apiKey === 'string' ? profile.apiKey.trim() : '',
    accessToken: typeof profile.accessToken === 'string' ? profile.accessToken.trim() : '',
    refreshToken: typeof profile.refreshToken === 'string' ? profile.refreshToken.trim() : '',
    username: typeof profile.username === 'string' ? profile.username.trim() : '',
    password: typeof profile.password === 'string' ? profile.password.trim() : '',
    notes: typeof profile.notes === 'string' ? profile.notes.trim() : '',
    connected: false,
  };
  sanitized.connected = isIntegrationProfileConnected(sanitized);
  return sanitized;
}