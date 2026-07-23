import { FoundationBadge } from '@pitstop/ui';

export default function WebFoundationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-5 px-6 py-12">
      <FoundationBadge tone="success">Phase 0</FoundationBadge>
      <h1 className="text-4xl font-bold tracking-tight">PitStop</h1>
      <p className="text-xl text-slate-700">Web Foundation</p>
      <p className="text-slate-600">Status: repository and engineering foundation.</p>
      <a
        className="w-fit text-green-700 underline underline-offset-4"
        href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/health/live`}
      >
        API health
      </a>
    </main>
  );
}
