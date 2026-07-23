import { FoundationBadge } from '@pitstop/ui';

export default function AdminFoundationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-5 px-8 py-12">
      <FoundationBadge>Phase 0</FoundationBadge>
      <h1 className="text-4xl font-bold tracking-tight">PitStop Admin</h1>
      <p className="text-xl text-slate-700">Admin Foundation</p>
      <p className="text-slate-600">Status: repository and engineering foundation.</p>
    </main>
  );
}
