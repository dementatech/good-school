'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  PLE_DIVISIONS,
  PRIOR_EXAM_TYPES,
  PRIOR_EXAM_TYPE_LABEL,
  UCE_RESULTS,
  type PriorExam,
  type PriorExamType,
} from './types';

interface FormState {
  id: string | null;
  examType: PriorExamType;
  examYear: string;
  candidateNumber: string;
  aggregate: string;
  divisionOrResult: string;
  notes: string;
}

const blankForm: FormState = {
  id: null,
  examType: 'PLE',
  examYear: String(new Date().getFullYear() - 1),
  candidateNumber: '',
  aggregate: '',
  divisionOrResult: '',
  notes: '',
};

function toForm(exam: PriorExam): FormState {
  return {
    id: exam.id,
    examType: exam.examType,
    examYear: String(exam.examYear),
    candidateNumber: exam.candidateNumber ?? '',
    aggregate: exam.aggregate != null ? String(exam.aggregate) : '',
    divisionOrResult: exam.divisionOrResult ?? '',
    notes: exam.notes ?? '',
  };
}

export function PriorExamsSection({ studentUserId }: { studentUserId: string }) {
  const toast = useToast();
  const [exams, setExams] = useState<PriorExam[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setExams(await fetchList<PriorExam>(`/api/v1/students/${studentUserId}/prior-exams`));

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId]);

  async function save() {
    if (!form) return;
    if (!form.examYear.trim()) {
      toast.error('Enter the exam year.');
      return;
    }
    setSaving(true);
    const body = {
      examType: form.examType,
      examYear: Number(form.examYear),
      candidateNumber: form.candidateNumber.trim() || null,
      aggregate: form.aggregate.trim() ? Number(form.aggregate) : null,
      divisionOrResult: form.divisionOrResult.trim() || null,
      notes: form.notes.trim() || null,
    };
    const res = form.id
      ? await submitJson(`/api/v1/students/${studentUserId}/prior-exams/${form.id}`, 'PATCH', body)
      : await submitJson(`/api/v1/students/${studentUserId}/prior-exams`, 'POST', body);
    setSaving(false);
    if (res.ok) {
      toast.success(form.id ? 'Result updated.' : 'Result recorded.');
      setForm(null);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  async function remove(exam: PriorExam) {
    if (!confirm(`Delete the ${exam.examType} ${exam.examYear} result?`)) return;
    const res = await submitJson(`/api/v1/students/${studentUserId}/prior-exams/${exam.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Result deleted.');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const results = form?.examType === 'PLE' ? PLE_DIVISIONS : UCE_RESULTS;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint">Prior exams</h3>
        {!form && (
          <Button type="button" variant="outline" inline onClick={() => setForm(blankForm)}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden />
            Add result
          </Button>
        )}
      </div>

      {exams === null ? (
        <p className="text-sm text-text-faint">Loading…</p>
      ) : exams.length === 0 && !form ? (
        <p className="text-sm text-text-faint">No PLE/UCE results on file.</p>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="rounded-xl border border-border p-3 text-sm flex items-start justify-between gap-2">
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <Badge variant="default">{exam.examType}</Badge>
                  {exam.examYear}
                  {exam.divisionOrResult ? ` · ${exam.divisionOrResult}` : ''}
                </div>
                <div className="text-text-faint">
                  {exam.aggregate != null ? `Aggregate ${exam.aggregate}` : 'No aggregate'}
                  {exam.candidateNumber ? ` · #${exam.candidateNumber}` : ''}
                  {exam.subjects.length > 0
                    ? ` · ${exam.subjects.map((s) => `${s.principalSubjectCode} ${s.grade}`).join(', ')}`
                    : ''}
                </div>
                {exam.notes && <div className="text-text-faint mt-0.5">{exam.notes}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => setForm(toForm(exam))} className="text-text-faint hover:text-primary-700">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => void remove(exam)} className="text-text-faint hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="mt-2 rounded-xl border border-border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Exam"
              value={form.examType}
              onChange={(e) => setForm({ ...form, examType: e.target.value as PriorExamType, divisionOrResult: '' })}
              options={PRIOR_EXAM_TYPES.map((t) => ({ value: t, label: PRIOR_EXAM_TYPE_LABEL[t] }))}
            />
            <Input label="Exam year" type="number" value={form.examYear} onChange={(e) => setForm({ ...form, examYear: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={form.examType === 'PLE' ? 'Index number' : 'Candidate number'}
              value={form.candidateNumber}
              onChange={(e) => setForm({ ...form, candidateNumber: e.target.value })}
            />
            <Input
              label={form.examType === 'PLE' ? 'Aggregate (4–36)' : 'Points / aggregate'}
              type="number"
              value={form.aggregate}
              onChange={(e) => setForm({ ...form, aggregate: e.target.value })}
            />
          </div>
          <Select
            label={form.examType === 'PLE' ? 'Division' : 'Result / division'}
            value={form.divisionOrResult}
            onChange={(e) => setForm({ ...form, divisionOrResult: e.target.value })}
            options={[{ value: '', label: '—' }, ...results.map((r) => ({ value: r, label: r }))]}
          />
          <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button type="button" isLoading={saving} inline onClick={() => void save()}>
              {form.id ? 'Save' : 'Record result'}
            </Button>
            <Button type="button" variant="outline" inline onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
