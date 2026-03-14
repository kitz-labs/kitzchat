import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KitzChat',
    short_name: 'KitzChat',
    description: 'AI team chat and operations workspace for admins and customers.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2f6bff',
    orientation: 'portrait',
    lang: 'de-DE',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      {
        src: '/kitzchat.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/kitzchat.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/kitzchat.png',
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
  };
}