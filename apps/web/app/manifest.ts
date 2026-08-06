import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: '#f8fafc',
    description: 'Temukan tempat makan dan singgah terverifikasi sesuai kebutuhan dan budget.',
    display: 'standalone',
    icons: [
      {
        sizes: '192x192',
        src: '/icons/pitstop-192.png',
        type: 'image/png',
      },
      {
        sizes: '512x512',
        src: '/icons/pitstop-512.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: '/icons/pitstop-maskable-512.png',
        type: 'image/png',
      },
    ],
    id: '/',
    lang: 'id',
    name: 'PitStop - Cari Tempat Singgah',
    scope: '/',
    short_name: 'PitStop',
    start_url: '/',
    theme_color: '#166534',
  };
}
