'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader } from '@/components/ui/loader';
import { PlanView } from '@/components/lesson-prep/PlanView';

function StaffPlan() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  // "new" can arrive from a timetabled lesson, pre-filled.
  const prefill = {
    classId: search.get('classId') ?? undefined,
    subjectId: search.get('subjectId') ?? undefined,
    streamId: search.get('streamId') ?? undefined,
    timetableSlotId: search.get('slot') ?? undefined,
    lessonDate: search.get('date') ?? undefined,
  };
  return <PlanView key={id} planId={id} mode="teacher" backHref="/staff/lessons" prefill={prefill} />;
}

export default function StaffPlanPage() {
  return (
    <Suspense fallback={<Loader size={44} />}>
      <StaffPlan />
    </Suspense>
  );
}
