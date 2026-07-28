import { notFound } from 'next/navigation';

import { ContributionDetailView } from '../../../components/contribution-detail';

const validContributionId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export default async function ContributionDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  if (!validContributionId.test(id)) notFound();
  return <ContributionDetailView contributionId={id} />;
}
