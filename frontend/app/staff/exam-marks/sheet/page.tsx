'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader } from '@/components/ui/loader';
import { MarkSheet } from '@/components/exams/MarkSheet';

function SheetContent() {
  const params = useSearchParams();
  const examId = params.get('exam') ?? '';
  const subjectId = params.get('subject') ?? '';
  const classId = params.get('class') ?? '';
  const streamId = params.get('stream');

  if (!examId || !subjectId || !classId) {
    return <p className="text-sm text-text-muted">Missing mark sheet details.</p>;
  }

  return (
    <MarkSheet
      examId={examId}
      slot={{ subjectId, classId, streamId: streamId || null }}
      backHref="/staff/exam-marks"
    />
  );
}

export default function StaffMarkSheetPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      }
    >
      <SheetContent />
    </Suspense>
  );
}
