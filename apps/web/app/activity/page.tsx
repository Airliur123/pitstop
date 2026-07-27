import { ProtectedPlaceholder } from '../../components/protected-placeholder';

export default function ActivityPage() {
  return (
    <ProtectedPlaceholder
      description="Riwayat kontribusi dan perubahan akun akan hadir setelah alur kontribusi dibangun."
      navigationCurrent="activity"
      returnTo="/activity"
      title="Aktivitas"
    />
  );
}
