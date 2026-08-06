import type { Metadata } from 'next';

import { OfflineExperience } from '../../components/offline-experience';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: 'Offline - PitStop',
};

export default function OfflinePage() {
  return <OfflineExperience />;
}
