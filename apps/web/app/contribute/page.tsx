import { ProtectedPlaceholder } from '../../components/protected-placeholder';

export default function ContributePage() {
  return (
    <ProtectedPlaceholder
      description="Alur menambah tempat akan dibangun pada fase kontribusi berikutnya."
      navigationCurrent="add"
      returnTo="/contribute"
      title="Tambah tempat"
    />
  );
}
