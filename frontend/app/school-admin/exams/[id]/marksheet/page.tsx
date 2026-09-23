'use client';

import { Suspense } from 'react';
import { usePortalBase } from '@/lib/portal';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader } from '@/components/ui/loader';
import { MarkSheet } from '@/components/exams/MarkSheet';

function SheetContent() {
  const { id } = useParams<{ id: string }>();
  const base = usePortalBase();
  const params = useSearchParams();
  const subjectId = params.get('subject') ?? '';
  const classId = params.get('class') ?? '';
  const streamId = params.get('stream');

  if (!subjectId || !classId) {
    return <p className="text-sm text-text-muted">Missing mark sheet details.</p>;
  }

  return (
    <MarkSheet
      examId={id}
      slot={{ subjectId, classId, streamId: streamId || null }}
      canReopen
      backHref={`${base}/exams/${id}`}
    />
  );
}

export default function SchoolAdminMarkSheetPage() {
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
