import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexora',
    short_name: 'Nexora',
    description: 'AI team chat and operations workspace for admins and customers.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait',
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
        label: 'Nexora Overview',
      },
      {
        src: '/kitzchat-mission-control.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Nexora Mission Control',
      },
    ],
  };
}
