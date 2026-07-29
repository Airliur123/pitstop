import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'PitStop Admin',
  description: 'Dashboard moderasi kontribusi PitStop.',
  robots: { follow: false, index: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
