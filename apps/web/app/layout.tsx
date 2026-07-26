import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'PitStop - Cari tempat singgah terdekat',
  description: 'Temukan tempat makan dan singgah terverifikasi sesuai kebutuhan dan budget.',
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
