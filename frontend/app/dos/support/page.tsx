import { Suspense } from 'react';
import { SupportPage } from '@/components/support/SupportPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportPage />
    </Suspense>
  );
}
