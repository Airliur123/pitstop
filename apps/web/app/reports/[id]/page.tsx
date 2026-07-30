import { notFound } from 'next/navigation';

import { ReportDetailView } from '../../../components/report-detail';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export default async function ReportDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  if (!validId.test(id)) notFound();
  return <ReportDetailView reportId={id} />;
}
