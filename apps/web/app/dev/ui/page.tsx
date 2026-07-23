import { notFound } from 'next/navigation';

import { UiCatalog } from './ui-catalog';

export default function UiCatalogPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_UI_CATALOG !== 'true') {
    notFound();
  }

  return <UiCatalog />;
}
