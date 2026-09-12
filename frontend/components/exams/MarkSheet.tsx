'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import type { MarkSheet as MarkSheetData, SlotKey } from './types';
import { slotLabel } from './types';

/** A plain (non-variant) subject is modelled as one column keyed by this
 * sentinel, so the whole grid — draft, dirty-check, save — is written once
 * against "cells" rather than branching subject shape throughout. */
const PLAIN_KEY = '_';

interface Cell {
  score: string;
  absent: boolean;
}

/** studentUserId -> cellKey (a variant id, or PLAIN_KEY) -> the cell. */
type Draft = Record<string, Record<string, Cell>>;

interface Column {
  key: string;
  label: string;
  sublabel: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString();

function columnsFor(sheet: MarkSheetData): Column[] {
  if (!sheet.subject.hasVariant) return [{ key: PLAIN_KEY, label: 'Score', sublabel: null }];
  return sheet.subject.variants.map((v) => ({
    key: v.id,
    label: v.name,
    sublabel: `${v.contributionPercent}%`,
  }));
}

function buildDraft(sheet: MarkSheetData): Draft {
  const d: Draft = {};
  for (const r of sheet.rows) {
    if (r.variantScores) {
      d[r.studentUserId] = {};
      for (const vs of r.variantScores) {
        d[r.studentUserId][vs.variantId] = {
          score: vs.rawScore === null ? '' : String(vs.rawScore),
          absent: vs.isAbsent,
        };
      }
    } else {
      d[r.studentUserId] = {
        [PLAIN_KEY]: { score: r.rawScore === null ? '' : String(r.rawScore), absent: r.isAbsent },
      };
    }
  }
  return d;
}

function cellOf(draft: Draft, studentUserId: string, key: string): Cell {
  return draft[studentUserId]?.[key] ?? { score: '', absent: false };
}

/**
 * Full-page mark-entry grid for one (subject, class, stream) slot of an exam.
 * A full page rather than a drawer on purpose: entering a class of marks is a
 * sit-down task, the data must be freshly loaded every time (no stale modal
 * state), and bulk edit/save tooling will grow here. The backend decides what
 * this actor may do and returns `editable`; `canReopen` adds the admin's
 * Reopen button on a submitted sheet.
 *
 * A subject examined as separate papers (Theory + Practical, ...) gets one
 * column per variant instead of one Score column; the subject's final mark —
 * the weighted merge of those columns — is computed server-side and shown
 * read-only.
 */
export function MarkSheet({
  examId,
  slot,
  canReopen = false,
  backHref,
}: {
  examId: string;
  slot: SlotKey;
  canReopen?: boolean;
  backHref: string;
}) {
  const toast = useToast();
  const [sheet, setSheet] = useState<MarkSheetData | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ subjectId: slot.subjectId, classId: slot.classId });
    if (slot.streamId) p.set('streamId', slot.streamId);
    return p.toString();
  }, [slot]);

  const slotBody = { subjectId: slot.subjectId, classId: slot.classId, streamId: slot.streamId };
  const columns = useMemo(() => (sheet ? columnsFor(sheet) : []), [sheet]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOne<MarkSheetData>(`/api/v1/exams/${examId}/marksheet?${qs}`);
    if (data) {
      setSheet(data);
      setDraft(buildDraft(data));
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [examId, qs]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const dirty = useMemo(() => {
    if (!sheet) return false;
    const original = buildDraft(sheet);
    return sheet.rows.some((r) =>
      columns.some((c) => {
        const a = cellOf(draft, r.studentUserId, c.key);
        const b = cellOf(original, r.studentUserId, c.key);
        return a.absent !== b.absent || a.score.trim() !== b.score;
      }),
    );
  }, [sheet, draft, columns]);

  // Warn before leaving with unsaved marks — the whole reason this is a page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const marked = sheet
    ? sheet.rows.filter((r) =>
        columns.every((c) => {
          const cell = cellOf(draft, r.studentUserId, c.key);
          return cell.absent || cell.score.trim() !== '';
        }),
      ).length
    : 0;

  function setCell(studentUserId: string, key: string, patch: Partial<Cell>) {
    setDraft((d) => ({
      ...d,
      [studentUserId]: { ...d[studentUserId], [key]: { ...cellOf(d, studentUserId, key), ...patch } },
    }));
  }

  function entries() {
    if (!sheet) return [];
    return sheet.rows.flatMap((r) =>
      columns.map((c) => {
        const cell = cellOf(draft, r.studentUserId, c.key);
        const variantId = c.key === PLAIN_KEY ? undefined : c.key;
        if (cell.absent) return { studentUserId: r.studentUserId, variantId, isAbsent: true as const };
        const t = cell.score.trim();
        return {
          studentUserId: r.studentUserId,
          variantId,
          isAbsent: false as const,
          rawScore: t === '' ? null : Number(t),
        };
      }),
    );
  }

  function hasInvalidScore(): boolean {
    if (!sheet) return false;
    return sheet.rows.some((r) =>
      columns.some((c) => {
        const cell = cellOf(draft, r.studentUserId, c.key);
        if (cell.absent) return false;
        const t = cell.score.trim();
        if (t === '') return false;
        const n = Number(t);
        return !Number.isFinite(n) || n < 0 || n > 100;
      }),
    );
  }

  function apply(res: { ok: boolean; error?: string; data?: MarkSheetData }, okMsg?: string): boolean {
    if (res.ok && res.data) {
      setSheet(res.data);
      setDraft(buildDraft(res.data));
      if (okMsg) toast.success(okMsg);
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
    const res = await submitJson<MarkSheetData>(`/api/v1/exams/${examId}/marksheet`, 'PUT', {
      ...slotBody,
      entries: entries(),
    });
    setBusy(false);
    return apply(res, 'Marks saved.');
  }

  async function submit() {
    if (dirty && !(await save())) return;
    setBusy(true);
    const res = await submitJson<MarkSheetData>(
      `/api/v1/exams/${examId}/marksheet/submit`,
      'POST',
      slotBody,
    );
    setBusy(false);
    apply(res, 'Mark sheet submitted.');
  }

  async function reopen() {
    setBusy(true);
    const res = await submitJson<MarkSheetData>(
      `/api/v1/exams/${examId}/marksheet/reopen`,
      'POST',
      slotBody,
    );
    setBusy(false);
    apply(res, 'Mark sheet reopened for editing.');
  }

  const backLink = (
    <Link href={backHref} className="text-sm text-primary-700 inline-flex items-center gap-1">
      <ArrowLeft className="w-4 h-4" aria-hidden /> Back
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      </div>
    );
  }

  if (notFound || !sheet) {
    return (
      <div className="space-y-3">
        {backLink}
        <p className="text-sm text-text-muted">
          This mark sheet could not be loaded — the exam, subject or class may no longer be valid.
        </p>
      </div>
    );
  }

  const readOnly = !sheet.editable;
  const hasVariant = sheet.subject.hasVariant;

  return (
    <div className="space-y-4 pb-24">
      {backLink}

      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1 flex flex-wrap items-center gap-2">
          {sheet.subject.name}
          <span className="text-text-muted font-normal">
            {slotLabel({ className: sheet.class.name, streamName: sheet.stream?.name ?? null })}
          </span>
          {sheet.submitted && (
            <Badge variant="muted">
              Submitted{sheet.submittedAt ? ` ${fmt(sheet.submittedAt)}` : ''}
            </Badge>
          )}
          {!sheet.submitted && sheet.exam.marksEntryOpen && <Badge variant="success">Entry open</Badge>}
          {!sheet.submitted && !sheet.exam.marksEntryOpen && <Badge variant="muted">Entry closed</Badge>}
        </h1>
        <p className="text-sm text-text-muted">
          {sheet.exam.name} · {sheet.exam.termName} · window {fmt(sheet.exam.startsOn)}–
          {fmt(sheet.exam.marksDueOn)}
        </p>
        {hasVariant && (
          <p className="text-xs text-text-faint mt-1">
            Examined as separate papers — {sheet.subject.variants.map((v) => `${v.name} ${v.contributionPercent}%`).join(' + ')}.
            The Final column is the weighted merge, computed automatically.
          </p>
        )}
      </div>

      {readOnly && (
        <p className="text-sm rounded-lg bg-bg-muted px-3 py-2 text-text-muted flex items-center gap-1.5">
          <Lock className="w-4 h-4 shrink-0" aria-hidden />
          {sheet.submitted
            ? `This sheet has been submitted. ${
                canReopen ? 'Reopen it to make changes.' : 'Ask a school admin to reopen it.'
              }`
            : "Marks entry isn't open for this exam right now."}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted bg-bg-subtle border-b border-border">
              <th className="py-2.5 px-4 w-10">#</th>
              <th className="py-2.5 px-2">Student</th>
              {columns.map((c) => (
                <th key={c.key} className="py-2.5 px-2 w-28">
                  {c.label}
                  {c.sublabel && <span className="text-text-faint font-normal"> ({c.sublabel})</span>}
                </th>
              ))}
              {hasVariant && <th className="py-2.5 px-2 w-24">Final</th>}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={2 + columns.length + (hasVariant ? 1 : 0)} className="py-8 text-center text-text-muted">
                  No students on this sheet.
                </td>
              </tr>
            )}
            {sheet.rows.map((r, i) => (
              <tr key={r.studentUserId} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 px-4 text-text-muted tabular-nums">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <span className="font-medium text-primary-900">{r.studentName}</span>
                  {r.systemId && <span className="text-text-muted"> · {r.systemId}</span>}
                </td>
                {columns.map((c) => {
                  const cell = cellOf(draft, r.studentUserId, c.key);
                  return (
                    <td key={c.key} className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          aria-label={`${r.studentName} — ${c.label}`}
                          className="w-16 rounded-lg border-2 border-[#E5E5E5] bg-white px-2 py-1.5 text-sm focus:border-primary-700 focus:outline-none disabled:bg-bg-muted disabled:text-text-muted"
                          value={cell.absent ? '' : cell.score}
                          disabled={readOnly || cell.absent}
                          onChange={(e) => setCell(r.studentUserId, c.key, { score: e.target.value })}
                        />
                        <label className="flex items-center gap-1 text-xs text-text-muted">
                          <input
                            type="checkbox"
                            aria-label={`Mark ${r.studentName} absent for ${c.label}`}
                            className="w-3.5 h-3.5 accent-primary-700"
                            checked={cell.absent}
                            disabled={readOnly}
                            onChange={(e) =>
                              setCell(r.studentUserId, c.key, {
                                absent: e.target.checked,
                                score: e.target.checked ? '' : cell.score,
                              })
                            }
                          />
                          Abs
                        </label>
                      </div>
                    </td>
                  );
                })}
                {hasVariant && (
                  <td className="py-1.5 px-2 font-medium text-primary-900 tabular-nums">
                    {r.isAbsent ? (
                      <span className="text-text-muted font-normal">Absent</span>
                    ) : r.rawScore === null ? (
                      <span className="text-text-faint font-normal">—</span>
                    ) : (
                      r.rawScore
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sticky action bar — always reachable however long the class list is. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-card/95 backdrop-blur px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3">
          <span className="text-sm text-text-muted">
            {marked} / {sheet.rows.length} marked
            {dirty && <span className="text-accent-dark"> · unsaved changes</span>}
          </span>
          <div className="flex flex-wrap gap-2 ml-auto">
            {!readOnly && (
              <>
                <Button inline variant="outline" onClick={() => void save()} isLoading={busy} disabled={!dirty}>
                  Save
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
          </div>
        </div>
      </div>
    </div>
  );
}
