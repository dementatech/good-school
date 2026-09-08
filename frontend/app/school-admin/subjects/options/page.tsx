'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { Pencil } from 'lucide-react';
import { OLevelSubjects } from '@/components/admin/students/StudentSubjectsPanel';
import { studentFullName, type Student, type StudentSubject } from '@/components/admin/students/types';

interface Row {
  student: Student;
  subjects: StudentSubject[];
}

export default function ManageOptionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const students = await fetchList<Student>('/api/v1/students');
    const oLevel = students.filter(
      (s) => s.isActive && s.activeEnrollment?.stagePhase === 'O_LEVEL',
    );
    const withSubjects = await Promise.all(
      oLevel.map(async (student) => ({
        student,
        subjects: await fetchList<StudentSubject>(
          `/api/v1/students/${student.userId}/subjects?academicYearId=${student.activeEnrollment!.academicYearId}`,
        ),
      })),
    );
    setRows(withSubjects);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Student',
      value: (r) => studentFullName(r.student),
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{studentFullName(r.student)}</span>
          {r.student.systemId && <Badge variant="muted">{r.student.systemId}</Badge>}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      value: (r) => r.student.activeEnrollment?.stageName ?? '',
      render: (r) => (
        <span>
          {r.student.activeEnrollment?.stageName}
          {r.student.activeEnrollment?.streamName ? ` · ${r.student.activeEnrollment.streamName}` : ''}
        </span>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects taken',
      value: (r) => r.subjects.filter((s) => s.status !== 'dropped').length,
      render: (r) => {
        const active = r.subjects.filter((s) => s.status !== 'dropped');
        if (active.length === 0) return <span className="text-text-faint italic">None yet</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {active.map((s) => (
              <Badge key={s.subjectId} variant="muted">
                {s.subjectCode}
              </Badge>
            ))}
          </span>
        );
      },
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Manage Options</h1>
        <p className="text-sm text-text-muted">
          O-Level students and the subjects they&apos;re registered for. Core subjects are fixed;
          edit a student to add or drop their optionals.
        </p>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowActions={(r) => [{ label: 'Edit subjects', icon: Pencil, onClick: () => setEditing(r) }]}
        rowKey={(r) => r.student.userId}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search students…"
        emptyMessage="No active O-Level students."
        exportFileName="o-level-options"
      />

      {editing && editing.student.activeEnrollment && (
        <Modal
          open
          onClose={() => {
            setEditing(null);
            void load();
          }}
          title={`Subjects — ${studentFullName(editing.student)}`}
          size="lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              {editing.student.activeEnrollment.stageName}
              {editing.student.activeEnrollment.streamName
                ? ` · ${editing.student.activeEnrollment.streamName}`
                : ''}{' '}
              · {editing.student.activeEnrollment.academicYearName}
            </p>
            <OLevelSubjects
              studentUserId={editing.student.userId}
              enrollment={editing.student.activeEnrollment}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
