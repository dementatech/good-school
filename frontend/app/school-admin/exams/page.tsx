'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { SchoolExamFormModal } from '@/components/admin/exams/SchoolExamFormModal';
import { submitJson, type SchoolExam } from '@/components/admin/exams/types';

interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}
interface Term {
  id: string;
  name: string;
}

const fmt = (d: string) => new Date(d).toLocaleDateString();

export default function SchoolAdminExamsPage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [exams, setExams] = useState<SchoolExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ initial?: SchoolExam } | null>(null);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      setYearId(current?.id ?? '');
    })();
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void (async () => {
      setTerms(await fetchList<Term>(`/api/v1/academic/terms?academicYearId=${yearId}`));
    })();
  }, [yearId]);

  const load = useCallback(async () => {
    if (!yearId) return;
    const qs = new URLSearchParams({ academicYearId: yearId });
    if (termId) qs.set('termId', termId);
    const rows = await fetchList<SchoolExam>(`/api/v1/exams?${qs.toString()}`);
    setExams(rows);
    setLoading(false);
  }, [yearId, termId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(url: string, method: 'POST' | 'DELETE', okMsg: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await submitJson(url, method);
    if (res.ok) {
      toast.success(okMsg);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<SchoolExam>[] = [
    {
      key: 'name',
      header: 'Exam',
      value: (e) => e.name,
      render: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{e.name}</span>
          <Badge variant="muted">{e.examCode}</Badge>
        </span>
      ),
    },
    { key: 'term', header: 'Term', value: (e) => e.termName, hideOnMobile: true },
    {
      key: 'window',
      header: 'Exam window',
      value: (e) => e.startsOn,
      render: (e) => (
        <span>
          {fmt(e.startsOn)} – {fmt(e.endsOn)}
        </span>
      ),
    },
    { key: 'marksDueOn', header: 'Marks due', value: (e) => e.marksDueOn, hideOnMobile: true, render: (e) => fmt(e.marksDueOn) },
    {
      key: 'status',
      header: 'Status',
      value: (e) => e.status,
      render: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={e.status === 'active' ? 'success' : 'muted'}>
            {e.status === 'active' ? 'Active' : 'Closed'}
          </Badge>
          {e.marksEntryOpen && <Badge variant="accent">Marks entry open</Badge>}
        </span>
      ),
    },
  ];

  const rowActions = (e: SchoolExam): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setModal({ initial: e }) },
    e.status === 'active'
      ? {
          label: 'Close',
          icon: Lock,
          onClick: () => void act(`/api/v1/exams/${e.id}/close`, 'POST', 'Exam closed.'),
        }
      : {
          label: 'Reopen',
          icon: LockOpen,
          onClick: () => void act(`/api/v1/exams/${e.id}/reopen`, 'POST', 'Exam reopened.'),
        },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void act(`/api/v1/exams/${e.id}`, 'DELETE', 'Exam deleted.', `Delete "${e.name}"?`),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Exams</h1>
        <p className="text-sm text-text-muted">
          Pick an exam session and activate it for the current term. The academic year and term are
          attached automatically — you set the exam dates and the mark-entry deadline.
        </p>
      </div>

      {years.length === 0 ? (
        <p className="text-sm text-text-muted">
          No academic years exist yet — create one under Academic Years first.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">Academic year</label>
              <select
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setTermId('');
                }}
                className="h-11 sm:h-9 border border-border rounded-lg px-3 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.yearName}
                    {y.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">Term</label>
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className="h-11 sm:h-9 border border-border rounded-lg px-3 text-sm"
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader size={44} />
            </div>
          ) : (
            <DataTable
              rows={exams}
              columns={columns}
              rowActions={rowActions}
              rowKey={(e) => e.id}
              initialSort={{ key: 'window', direction: 'desc' }}
              emptyMessage="No exams for this selection yet."
              exportFileName="exams"
              actions={
                <Button onClick={() => setModal({})}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                  Create exam
                </Button>
              }
            />
          )}
        </>
      )}

      {modal && (
        <SchoolExamFormModal
          open
          onClose={() => setModal(null)}
          onSaved={load}
          initial={modal.initial}
        />
      )}
    </div>
  );
}
