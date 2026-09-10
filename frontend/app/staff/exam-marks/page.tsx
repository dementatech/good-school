'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { MarkSheetDrawer } from '@/components/exams/MarkSheetDrawer';
import { slotLabel, type AssignedExam, type ExamSlot, type SlotKey } from '@/components/exams/types';

const fmt = (d: string) => new Date(d).toLocaleDateString();

function SlotStatus({ slot }: { slot: ExamSlot }) {
  if (slot.submitted) return <Badge variant="muted">Submitted</Badge>;
  if (slot.rosterCount > 0 && slot.enteredCount >= slot.rosterCount)
    return <Badge variant="accent">Ready to submit</Badge>;
  return (
    <span className="text-xs text-text-muted">
      {slot.enteredCount} / {slot.rosterCount} marked
    </span>
  );
}

export default function StaffExamMarksPage() {
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ examId: string; slot: SlotKey } | null>(null);

  const load = useCallback(async () => {
    setExams(await fetchList<AssignedExam>('/api/v1/exams/assigned'));
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Exam Marks</h1>
        <p className="text-sm text-text-muted">
          Enter scores for the exams and classes you teach. A sheet stays editable while marks entry
          is open — submit it when every student has a score or is marked absent.
        </p>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      ) : exams.length === 0 ? (
        <p className="text-sm text-text-muted">
          You have no active exams to mark. They&apos;ll appear here once a school admin activates an
          exam for a term you teach in.
        </p>
      ) : (
        exams.map((exam) => (
          <Card key={exam.examId} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-semibold text-primary-900">{exam.examName}</span>
              <span className="text-sm text-text-muted">{exam.termName}</span>
              <span className="text-sm text-text-muted">
                · marks due {fmt(exam.marksDueOn)}
              </span>
              {exam.marksEntryOpen ? (
                <Badge variant="success">Entry open</Badge>
              ) : (
                <Badge variant="muted">Entry closed</Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted border-b border-border">
                    <th className="py-2 pr-2">Subject</th>
                    <th className="py-2 px-2">Class</th>
                    <th className="py-2 px-2">Progress</th>
                    <th className="py-2 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {exam.slots.map((slot) => (
                    <tr
                      key={`${slot.subjectId}:${slot.classId}:${slot.streamId ?? ''}`}
                      className="border-b border-border/60 cursor-pointer hover:bg-bg-subtle"
                      onClick={() =>
                        setOpen({
                          examId: exam.examId,
                          slot: {
                            subjectId: slot.subjectId,
                            classId: slot.classId,
                            streamId: slot.streamId,
                          },
                        })
                      }
                    >
                      <td className="py-2 pr-2 font-medium text-primary-900">{slot.subjectName}</td>
                      <td className="py-2 px-2">{slotLabel(slot)}</td>
                      <td className="py-2 px-2">
                        <SlotStatus slot={slot} />
                      </td>
                      <td className="py-2 pl-2 text-right text-xs text-primary-700">Open →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      {open && (
        <MarkSheetDrawer
          examId={open.examId}
          slot={open.slot}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
