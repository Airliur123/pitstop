import { notFound } from 'next/navigation';

import { PlaceDetailView } from '../../../components/place-detail-view';

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function PlaceDetailPage({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  if (!validSlug.test(slug) || slug.length > 200) notFound();
  return <PlaceDetailView slug={slug} />;
}
