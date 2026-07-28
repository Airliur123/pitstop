import { Suspense } from 'react';

import { ContributionFlow } from '../../components/contribution-flow';

export default function ContributePage() {
  return (
    <Suspense fallback={null}>
      <ContributionFlow />
    </Suspense>
  );
}
