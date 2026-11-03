import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/kit/avatar';
import { Badge } from '@/components/kit/badge';
import { Button } from '@/components/kit/button';
import { Progress } from '@/components/kit/progress';
import {
  examStatusLabel,
  formatShortDate,
  initialsOf,
  type DashboardExam,
  type MarksProgress,
} from '@/lib/school-admin/dashboard';
import { Panel } from './Panel';

const MAX_AVATARS = 4;

function PendingTeachers({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_AVATARS);
  const extra = names.length - shown.length;
  return (
    <div
      className="flex -space-x-2 shrink-0"
      role="img"
      aria-label={`${names.length} teacher${names.length === 1 ? '' : 's'} still to submit marks`}
      title={`Still to submit: ${names.join(', ')}`}
    >
      {shown.map((name) => (
        <Avatar key={name} className="size-8 ring-2 ring-card">
          <AvatarFallback className="bg-primary-100 text-primary-700 text-[10px] font-bold">{initialsOf(name)}</AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <Avatar className="size-8 ring-2 ring-card">
          <AvatarFallback className="text-[10px] font-bold">+{extra}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

/** Exams still in play and how far along their mark sheets are. */
export function OngoingExamsPanel({
  exams,
  progress,
  today,
  loading,
  base,
}: {
  exams: DashboardExam[];
  progress: Record<string, MarksProgress | undefined>;
  today: string;
  loading: boolean;
  /** The portal these links stay inside, e.g. /school-admin or /dos. */
  base: string;
}) {
  return (
    <Panel
      icon={ClipboardList}
      title="Ongoing exams"
      description="Mark sheets handed in so far"
      loading={loading}
      empty={exams.length === 0 ? 'No exams in progress.' : undefined}
      action={
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <Link href={`${base}/exams`}>Manage</Link>
        </Button>
      }
    >
      <ul className="space-y-3">
        {exams.map((exam) => {
          const marks = progress[exam.id];
          return (
            <li key={exam.id}>
              <Link
                href={`${base}/exams/${exam.id}`}
                className="block rounded-xl border border-border p-4 transition-shadow hover:shadow-card-hover"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary-900 truncate">{exam.name}</p>
                    <p className="text-xs text-muted-foreground">{exam.termName}</p>
                  </div>
                  <PendingTeachers names={marks?.pendingTeachers ?? []} />
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <Badge variant="secondary">{examStatusLabel(exam, today)}</Badge>
                    <span className="text-muted-foreground">
                      {exam.marksDueOn ? `Due ${formatShortDate(exam.marksDueOn)}` : 'No due date'}
                    </span>
                  </div>
                  <Progress value={marks?.percent ?? 0} aria-label="Mark sheets submitted" className="h-1.5" />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {marks && marks.total > 0 ? `${marks.submitted} of ${marks.total} submitted` : 'No mark sheets yet'}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
