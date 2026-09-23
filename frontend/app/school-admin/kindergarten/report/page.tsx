'use client';

import { Suspense } from 'react';
import { Loader } from '@/components/ui/loader';
import { KindergartenGate } from '@/components/early-years/KindergartenGate';
import { KindergartenReport } from '@/components/early-years/KindergartenReport';

export default function KindergartenReportPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      }
    >
      <KindergartenGate>
        <KindergartenReport portal="school-admin" />
      </KindergartenGate>
    </Suspense>
  );
}
