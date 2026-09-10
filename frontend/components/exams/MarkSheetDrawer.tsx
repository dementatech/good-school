'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import { Check, Lock } from 'lucide-react';
import type { MarkSheet, SlotKey } from './types';
import { slotLabel } from './types';

type Draft = Record<string, { score: string; absent: boolean }>;

const fmt = (d: string) => new Date(d).toLocaleDateString();

function buildDraft(sheet: MarkSheet): Draft {
  const d: Draft = {};
  for (const r of sheet.rows) {
    d[r.studentUserId] = { score: r.rawScore === null ? '' : String(r.rawScore), absent: r.isAbsent };
  }
  return d;
}

/**
 * The mark-entry grid for one (subject, class, stream) slot of an exam. Used by
 * both the teacher portal and the school-admin completion view — the backend
 * decides what this actor may do and returns `editable` accordingly. `canReopen`
 * only adds the admin's Reopen button on an already-submitted sheet.
 */
export function MarkSheetDrawer({
  examId,
  slot,
  canReopen = false,
  onClose,
  onSaved,
}: {
  examId: string;
  slot: SlotKey;
  canReopen?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [sheet, setSheet] = useState<MarkSheet | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ subjectId: slot.subjectId, classId: slot.classId });
    if (slot.streamId) p.set('streamId', slot.streamId);
    return p.toString();
  }, [slot]);

  const slotBody = { subjectId: slot.subjectId, classId: slot.classId, streamId: slot.streamId };

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOne<MarkSheet>(`/api/v1/exams/${examId}/marksheet?${qs}`);
    if (data) {
      setSheet(data);
      setDraft(buildDraft(data));
    } else {
      toast.error('Could not load the mark sheet.');
    }
    setLoading(false);
  }, [examId, qs, toast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const dirty = useMemo(() => {
    if (!sheet) return false;
    return sheet.rows.some((r) => {
      const d = draft[r.studentUserId];
      if (!d) return false;
      const score = r.rawScore === null ? '' : String(r.rawScore);
      return d.absent !== r.isAbsent || d.score.trim() !== score;
    });
  }, [sheet, draft]);

  const marked = sheet
    ? sheet.rows.filter((r) => {
        const d = draft[r.studentUserId];
        return d && (d.absent || d.score.trim() !== '');
      }).length
    : 0;

  function setRow(id: string, patch: Partial<{ score: string; absent: boolean }>) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function entries() {
    return Object.entries(draft).map(([studentUserId, d]) => {
      if (d.absent) return { studentUserId, isAbsent: true as const };
      const t = d.score.trim();
      return { studentUserId, isAbsent: false as const, rawScore: t === '' ? null : Number(t) };
    });
  }

  function hasInvalidScore(): boolean {
    return Object.values(draft).some((d) => {
      if (d.absent) return false;
      const t = d.score.trim();
      if (t === '') return false;
      const n = Number(t);
      return !Number.isFinite(n) || n < 0 || n > 100;
    });
  }

  function apply(res: { ok: boolean; error?: string; data?: MarkSheet }, okMsg?: string): boolean {
    if (res.ok && res.data) {
      setSheet(res.data);
      setDraft(buildDraft(res.data));
      if (okMsg) toast.success(okMsg);
      onSaved?.();
      return true;
    }
    toast.error(res.error ?? 'Something went wrong.');
    return false;
  }

  async function save(): Promise<boolean> {
    if (hasInvalidScore()) {
      toast.error('Scores must be between 0 and 100.');
      return false;
    }
    setBusy(true);
    const res = await submitJson<MarkSheet>(`/api/v1/exams/${examId}/marksheet`, 'PUT', {
      ...slotBody,
      entries: entries(),
    });
    setBusy(false);
    return apply(res);
  }

  async function submit() {
    if (dirty && !(await save())) return;
    setBusy(true);
    const res = await submitJson<MarkSheet>(`/api/v1/exams/${examId}/marksheet/submit`, 'POST', slotBody);
    setBusy(false);
    apply(res, 'Mark sheet submitted.');
  }

  async function reopen() {
    setBusy(true);
    const res = await submitJson<MarkSheet>(`/api/v1/exams/${examId}/marksheet/reopen`, 'POST', slotBody);
    setBusy(false);
    apply(res, 'Mark sheet reopened for editing.');
  }

  const title = sheet
    ? `${sheet.subject.name} — ${slotLabel({ className: sheet.class.name, streamName: sheet.stream?.name ?? null })}`
    : 'Mark sheet';
  const readOnly = !sheet?.editable;

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      {loading || !sheet ? (
        <div className="py-16 flex justify-center">
          <Loader size={40} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
            <span className="font-medium text-primary-900">{sheet.exam.name}</span>
            <span>· {sheet.exam.termName}</span>
            <span>
              · window {fmt(sheet.exam.startsOn)}–{fmt(sheet.exam.marksDueOn)}
            </span>
            {sheet.submitted && (
              <Badge variant="muted">
                Submitted{sheet.submittedAt ? ` ${fmt(sheet.submittedAt)}` : ''}
              </Badge>
            )}
            {!sheet.submitted && sheet.exam.marksEntryOpen && <Badge variant="success">Entry open</Badge>}
            {!sheet.submitted && !sheet.exam.marksEntryOpen && <Badge variant="muted">Entry closed</Badge>}
          </div>

          {readOnly && (
            <p className="text-xs rounded-lg bg-bg-muted px-3 py-2 text-text-muted flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
              {sheet.submitted
                ? `This sheet has been submitted. ${
                    canReopen ? 'Reopen it to make changes.' : 'Ask a school admin to reopen it.'
                  }`
                : "Marks entry isn't open for this exam right now."}
            </p>
          )}

          <div className="text-xs text-text-muted">
            {marked} / {sheet.rows.length} marked
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="py-2 pl-1 pr-2">Student</th>
                  <th className="py-2 px-2 w-24">Score</th>
                  <th className="py-2 px-2 w-16">Absent</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-text-muted">
                      No students on this sheet.
                    </td>
                  </tr>
                )}
                {sheet.rows.map((r) => {
                  const d = draft[r.studentUserId] ?? { score: '', absent: false };
                  return (
                    <tr key={r.studentUserId} className="border-b border-border/60">
                      <td className="py-1.5 pl-1 pr-2">
                        <span className="font-medium text-primary-900">{r.studentName}</span>
                        {r.systemId && <span className="text-text-muted"> · {r.systemId}</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          className="w-20 rounded-lg border-2 border-[#E5E5E5] bg-white px-2 py-1.5 text-sm focus:border-primary-700 focus:outline-none disabled:bg-bg-muted disabled:text-text-muted"
                          value={d.absent ? '' : d.score}
                          disabled={readOnly || d.absent}
                          onChange={(e) => setRow(r.studentUserId, { score: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary-700"
                          checked={d.absent}
                          disabled={readOnly}
                          onChange={(e) =>
                            setRow(r.studentUserId, {
                              absent: e.target.checked,
                              score: e.target.checked ? '' : d.score,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {!readOnly && (
              <>
                <Button inline variant="outline" onClick={() => void save()} isLoading={busy} disabled={!dirty}>
                  Save draft
                </Button>
                <Button inline onClick={() => void submit()} isLoading={busy}>
                  <Check className="w-4 h-4" aria-hidden /> Submit
                </Button>
              </>
            )}
            {sheet.submitted && canReopen && (
              <Button inline variant="outline" onClick={() => void reopen()} isLoading={busy}>
                Reopen
              </Button>
            )}
            <Button inline variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
