import { notFound } from 'next/navigation';

import { ReportChangeFlow } from '../../../../components/report-change-flow';

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function ReportChangePage({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  if (!validSlug.test(slug) || slug.length > 200) notFound();
  return <ReportChangeFlow slug={slug} />;
}
