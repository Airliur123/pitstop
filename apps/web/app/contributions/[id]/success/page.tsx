import { notFound } from 'next/navigation';

import { ContributionSuccessView } from '../../../../components/contribution-success';

const validContributionId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export default async function ContributionSuccessPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  if (!validContributionId.test(id)) notFound();
  return <ContributionSuccessView contributionId={id} />;
}
