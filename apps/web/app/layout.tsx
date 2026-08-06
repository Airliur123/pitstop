import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  applicationName: 'PitStop',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PitStop',
  },
  description: 'Temukan tempat makan dan singgah terverifikasi sesuai kebutuhan dan budget.',
  icons: {
    apple: [{ sizes: '192x192', type: 'image/png', url: '/icons/pitstop-192.png' }],
    icon: [
      { sizes: '192x192', type: 'image/png', url: '/icons/pitstop-192.png' },
      { sizes: '512x512', type: 'image/png', url: '/icons/pitstop-512.png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  title: 'PitStop - Cari tempat singgah terdekat',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#166534',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
