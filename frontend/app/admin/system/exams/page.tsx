'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ExamSessionFormModal } from '@/components/admin/exams/ExamSessionFormModal';
import { submitJson, type ExamSession } from '@/components/admin/exams/types';

export default function ExamSessionsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ initial?: ExamSession } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/exams/sessions', { credentials: 'include' }).then((r) => r.json());
    if (res.success) setSessions(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function del(s: ExamSession) {
    if (!confirm(`Delete exam session "${s.examName}"?`)) return;
    const res = await submitJson(`/api/v1/exams/sessions/${s.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Exam session deleted.');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<ExamSession>[] = [
    {
      key: 'examCode',
      header: 'Code',
      value: (s) => s.examCode,
      render: (s) => <span className="font-medium">{s.examCode}</span>,
    },
    { key: 'examName', header: 'Name', value: (s) => s.examName },
    {
      key: 'description',
      header: 'Description',
      value: (s) => s.description ?? '',
      hideOnMobile: true,
      render: (s) => s.description ?? <span className="text-text-faint">—</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      value: (s) => (s.isActive ? 'Active' : 'Inactive'),
      render: (s) => (
        <Badge variant={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ];

  const rowActions = (s: ExamSession): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setModal({ initial: s }) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void del(s),
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Exam Sessions</h1>
        <p className="text-sm text-text-muted">
          The catalog of examination types every school picks from — Mid-Term, End of Term, Mock,
          and so on. A school activates one of these for a term; the year and term are attached
          automatically.
        </p>
      </div>

      <DataTable
        rows={sessions}
        columns={columns}
        rowActions={rowActions}
        rowKey={(s) => s.id}
        initialSort={{ key: 'examName', direction: 'asc' }}
        emptyMessage="No exam sessions yet. Add the first one."
        exportFileName="exam-sessions"
        actions={
          <Button onClick={() => setModal({})}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Add exam session
          </Button>
        }
      />

      {modal && (
        <ExamSessionFormModal
          open
          onClose={() => setModal(null)}
          onSaved={load}
          initial={modal.initial}
        />
      )}
    </div>
  );
}
