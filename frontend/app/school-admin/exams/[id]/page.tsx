'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/loader';
import { fetchOne } from '@/lib/api/envelope';
import { ArrowLeft } from 'lucide-react';
import {
  slotLabel,
  type ExamCompletion,
  type ExamCompletionSlot,
} from '@/components/exams/types';

const fmt = (d: string) => new Date(d).toLocaleDateString();

function sheetHref(examId: string, slot: ExamCompletionSlot): string {
  const p = new URLSearchParams({ subject: slot.subjectId, class: slot.classId });
  if (slot.streamId) p.set('stream', slot.streamId);
  return `/school-admin/exams/${examId}/marksheet?${p.toString()}`;
}

function Progress({ slot }: { slot: ExamCompletionSlot }) {
  const done = slot.rosterCount > 0 && slot.enteredCount >= slot.rosterCount;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={done ? 'text-green-700' : 'text-text-muted'}>
        {slot.enteredCount} / {slot.rosterCount}
      </span>
      {slot.submitted ? (
        <Badge variant="muted">Submitted</Badge>
      ) : done ? (
        <Badge variant="accent">Ready</Badge>
      ) : null}
    </span>
  );
}

export default function SchoolAdminExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ExamCompletion | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setData(await fetchOne<ExamCompletion>(`/api/v1/exams/${id}/completion`));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Refresh progress when returning from a mark sheet.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Link href="/school-admin/exams" className="text-sm text-primary-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to exams
        </Link>
        <p className="text-sm text-text-muted">This exam could not be loaded.</p>
      </div>
    );
  }

  const { exam, slots } = data;
  const totalEntered = slots.reduce((n, s) => n + s.enteredCount, 0);
  const totalRoster = slots.reduce((n, s) => n + s.rosterCount, 0);
  const submittedCount = slots.filter((s) => s.submitted).length;

  return (
    <div className="space-y-4">
      <Link href="/school-admin/exams" className="text-sm text-primary-700 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to exams
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1 flex flex-wrap items-center gap-2">
          {exam.name}
          <Badge variant={exam.status === 'active' ? 'success' : 'muted'}>
            {exam.status === 'active' ? 'Active' : 'Closed'}
          </Badge>
          {exam.marksEntryOpen && <Badge variant="accent">Marks entry open</Badge>}
          {exam.publishedAt && <Badge variant="accent">Published {fmt(exam.publishedAt)}</Badge>}
        </h1>
        <p className="text-sm text-text-muted">
          {exam.termName} · window {fmt(exam.startsOn)}–{fmt(exam.endsOn)} · marks due{' '}
          {fmt(exam.marksDueOn)}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Card className="px-4 py-3">
          <p className="text-xs text-text-muted">Marks entered</p>
          <p className="text-lg font-semibold text-primary-900">
            {totalEntered} / {totalRoster}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-text-muted">Sheets submitted</p>
          <p className="text-lg font-semibold text-primary-900">
            {submittedCount} / {slots.length}
          </p>
        </Card>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted border-b border-border">
              <th className="py-2.5 px-4">Subject</th>
              <th className="py-2.5 px-2">Class</th>
              <th className="py-2.5 px-2">Teacher</th>
              <th className="py-2.5 px-2">Progress</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  No teaching assignments for this exam&apos;s academic year yet — assign subject
                  teachers first.
                </td>
              </tr>
            )}
            {slots.map((slot) => (
              <tr
                key={`${slot.subjectId}:${slot.classId}:${slot.streamId ?? ''}`}
                className="border-b border-border/60"
              >
                <td className="py-2.5 px-4 font-medium text-primary-900">{slot.subjectName}</td>
                <td className="py-2.5 px-2">{slotLabel(slot)}</td>
                <td className="py-2.5 px-2 text-text-muted">{slot.teacherName ?? '—'}</td>
                <td className="py-2.5 px-2">
                  <Progress slot={slot} />
                </td>
                <td className="py-2.5 px-4 text-right">
                  <Button
                    inline
                    variant="outline"
                    onClick={() => router.push(sheetHref(id, slot))}
                  >
                    {slot.submitted ? 'View' : 'Enter marks'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
