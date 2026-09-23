'use client';

import { KindergartenGate } from '@/components/early-years/KindergartenGate';
import { KindergartenProgress } from '@/components/early-years/KindergartenProgress';

export default function KindergartenProgressPage() {
  return (
    <KindergartenGate>
      <KindergartenProgress portal="school-admin" />
    </KindergartenGate>
  );
}
