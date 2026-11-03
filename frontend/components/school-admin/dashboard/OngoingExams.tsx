import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  examStatusLabel,
  formatShortDate,
  initialsOf,
  type DashboardExam,
  type MarksProgress,
} from '@/lib/school-admin/dashboard';
import { PanelHeader } from './PanelHeader';

const MAX_AVATARS = 4;

function PendingTeachers({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_AVATARS);
  const extra = names.length - shown.length;
  const avatar = 'w-8 h-8 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-bold';
  return (
    <div
      className="flex -space-x-2 shrink-0"
      role="img"
      aria-label={`${names.length} teacher${names.length === 1 ? '' : 's'} still to submit marks`}
      title={`Still to submit: ${names.join(', ')}`}
    >
      {shown.map((name) => (
        <span key={name} className={`${avatar} bg-primary-100 text-primary-700`}>
          {initialsOf(name)}
        </span>
      ))}
      {extra > 0 && <span className={`${avatar} bg-bg-muted text-text-secondary`}>+{extra}</span>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">{label}</dt>
      <dd className="text-xs font-semibold text-primary-900 mt-0.5">{value}</dd>
    </div>
  );
}

export function OngoingExams({
  exams,
  progress,
  today,
  loading,
}: {
  exams: DashboardExam[];
  progress: Record<string, MarksProgress | undefined>;
  today: string;
  loading: boolean;
}) {
  return (
    <Card>
      <PanelHeader icon={ClipboardList} title="Ongoing exams" subtitle="Mark sheets handed in so far" />

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : exams.length === 0 ? (
        <p className="text-sm text-text-muted">
          No exams in progress.{' '}
          <Link href="/school-admin/exams" className="font-semibold text-primary-700 hover:underline">
            Manage exams
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const marks = progress[exam.id];
            return (
              <li key={exam.id}>
                <Link
                  href={`/school-admin/exams/${exam.id}`}
                  className="block rounded-xl border border-border p-4 transition-shadow hover:shadow-card-hover"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary-900 truncate">{exam.name}</p>
                      <p className="text-xs text-text-muted">{exam.termName}</p>
                    </div>
                    <PendingTeachers names={marks?.pendingTeachers ?? []} />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 mt-3">
                    <Fact label="Status" value={examStatusLabel(exam, today)} />
                    <Fact label="Submitted" value={marks && marks.total > 0 ? `${marks.percent}%` : '—'} />
                    <Fact label="Marks due" value={exam.marksDueOn ? formatShortDate(exam.marksDueOn) : '—'} />
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
