import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KitzChat',
    short_name: 'KitzChat',
    description: 'AI team chat and operations workspace for admins and customers.',
    start_url: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    background_color: '#06080e',
    theme_color: '#1268fb',
    orientation: 'any',
    lang: 'de-DE',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      {
        src: '/brand/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/kitzchat-overview.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'KitzChat Overview',
      },
      {
        src: '/kitzchat-mission-control.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'KitzChat Mission Control',
      },
    ],
    shortcuts: [
      {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Direkt in den Kundenchat springen.',
        url: '/',
      },
      {
        name: 'Guthaben',
        short_name: 'Wallet',
        description: 'Wallet, Top-ups und Rechnungen oeffnen.',
        url: '/usage-token',
      },
      {
        name: 'Kunden',
        short_name: 'Customers',
        description: 'Admin Customer Health und Billing Truth ansehen.',
        url: '/customers',
      },
    ],
  };
}
