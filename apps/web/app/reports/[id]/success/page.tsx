import { notFound } from 'next/navigation';

import { ReportSuccess } from '../../../../components/report-success';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export default async function ReportSuccessPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  if (!validId.test(id)) notFound();
  return <ReportSuccess reportId={id} />;
}
