import { PlacesResults } from '../../components/places-results';
import { parsePlacesUrlState } from '../../lib/url-state';

export default async function PlacesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const state = parsePlacesUrlState(await searchParams);
  return <PlacesResults state={state} />;
}
