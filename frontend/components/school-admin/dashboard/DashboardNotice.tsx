import Link from 'next/link';
import { BellRing } from 'lucide-react';
import type { DashboardNotice as Notice } from '@/lib/school-admin/dashboard';

export function DashboardNotice({ notice }: { notice: Notice }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-card bg-white border border-border shadow-card p-4 sm:px-5 mb-3 sm:mb-4">
      <span className="hidden sm:flex w-11 h-11 rounded-full bg-primary-900 text-white items-center justify-center shrink-0">
        <BellRing className="w-5 h-5" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary-900">{notice.title}</p>
        <p className="text-sm text-text-muted mt-0.5">{notice.message}</p>
      </div>
      <Link
        href={`/school-admin/exams/${notice.examId}`}
        className="self-start sm:self-auto shrink-0 rounded-full bg-primary-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-600"
      >
        View exam
      </Link>
    </div>
  );
}
