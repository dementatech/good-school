'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { Modal } from '@/components/ui/Modal';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Eye, KeyRound, Pencil, Plus, RotateCcw, UserX } from 'lucide-react';
import { StudentFormModal } from '@/components/admin/students/StudentFormModal';
import { StudentDetailModal } from '@/components/admin/students/StudentDetailModal';
import { LIN_STATUS_LABEL, studentFullName, type Student } from '@/components/admin/students/types';

function ResetPasswordModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const toast = useToast();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await submitJson<Record<string, string>>('/api/v1/students/reset-passwords', 'POST', {
        userIds: [student.userId],
      });
      if (res.ok && res.data?.[student.userId]) {
        setTempPassword(res.data[student.userId]);
      } else {
        toast.error(res.error ?? 'Could not reset the password.');
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal open onClose={onClose} title={`Reset password — ${studentFullName(student)}`}>
      {tempPassword ? (
        <CredentialsCard
          name={studentFullName(student)}
          systemId={student.systemId}
          temporaryPassword={tempPassword}
          emailSent={false}
          hasEmail={Boolean(student.email)}
          onDismiss={onClose}
        />
      ) : (
        <div className="flex justify-center py-8">
          <Loader size={40} />
        </div>
      )}
    </Modal>
  );
}

export default function SchoolAdminStudentsPage() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [formStudent, setFormStudent] = useState<{ student?: Student } | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [resetting, setResetting] = useState<Student | null>(null);

  const load = useCallback(async () => {
    setStudents(await fetchList<Student>('/api/v1/students'));
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function toggleActive(student: Student) {
    const action = student.isActive ? 'archive' : 'restore';
    const res = await submitJson(`/api/v1/students/${student.userId}/${action}`, 'POST');
    if (res.ok) {
      toast.success(student.isActive ? `${studentFullName(student)} deactivated.` : `${studentFullName(student)} restored.`);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      value: (s) => studentFullName(s),
      render: (s) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{studentFullName(s)}</span>
          {s.systemId && <Badge variant="muted">{s.systemId}</Badge>}
          {!s.isActive && <Badge variant="muted">Inactive</Badge>}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      value: (s) => s.activeEnrollment?.stageName ?? '',
      render: (s) =>
        s.activeEnrollment ? (
          <span>
            {s.activeEnrollment.stageName}
            {s.activeEnrollment.streamName ? ` · ${s.activeEnrollment.streamName}` : ''}
          </span>
        ) : (
          <span className="text-text-faint italic">Not enrolled</span>
        ),
    },
    {
      key: 'lin',
      header: 'LIN',
      value: (s) => s.lin ?? '',
      hideOnMobile: true,
      render: (s) => s.lin ?? <span className="text-text-faint">{LIN_STATUS_LABEL[s.linStatus]}</span>,
    },
    { key: 'gender', header: 'Gender', value: (s) => s.gender ?? '', hideOnMobile: true, render: (s) => <span className="capitalize">{s.gender ?? '—'}</span> },
    { key: 'phone', header: 'Phone', value: (s) => s.phoneNumber ?? '', hideOnMobile: true },
  ];

  const rowActions = (s: Student): DropdownMenuItem[] => [
    { label: 'View', icon: Eye, onClick: () => setViewing(s) },
    { label: 'Edit', icon: Pencil, onClick: () => setFormStudent({ student: s }) },
    { label: 'Reset password', icon: KeyRound, onClick: () => setResetting(s) },
    {
      label: s.isActive ? 'Deactivate' : 'Restore',
      icon: s.isActive ? UserX : RotateCcw,
      danger: s.isActive,
      separatorBefore: true,
      onClick: () => void toggleActive(s),
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Students</h1>
        <p className="text-sm text-text-muted">
          Enrolling a student captures their identity, their class/stream for this year, and at
          least one guardian, in one step.
        </p>
      </div>

      <DataTable
        rows={students}
        columns={columns}
        rowActions={rowActions}
        rowKey={(s) => s.userId}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search students…"
        emptyMessage="No students yet. Enrol the first one."
        exportFileName="students"
        actions={
          <Button onClick={() => setFormStudent({})}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Enrol student
          </Button>
        }
      />

      {formStudent && (
        <StudentFormModal
          open
          onClose={() => setFormStudent(null)}
          onSaved={load}
          student={formStudent.student}
        />
      )}
      {viewing && (
        <StudentDetailModal
          open
          onClose={() => setViewing(null)}
          onChanged={load}
          student={viewing}
        />
      )}
      {resetting && <ResetPasswordModal student={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
