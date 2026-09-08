'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { Pencil } from 'lucide-react';
import { ALevelCombination } from '@/components/admin/students/StudentSubjectsPanel';
import {
  studentFullName,
  type Student,
  type StudentCombination,
} from '@/components/admin/students/types';

interface Row {
  student: Student;
  combination: StudentCombination | null;
}

export default function ManageCombinationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const students = await fetchList<Student>('/api/v1/students');
    const aLevel = students.filter(
      (s) => s.isActive && s.activeEnrollment?.stagePhase === 'A_LEVEL',
    );
    const withCombos = await Promise.all(
      aLevel.map(async (student) => {
        const res = await fetch(
          `/api/v1/students/${student.userId}/combination?academicYearId=${student.activeEnrollment!.academicYearId}`,
          { credentials: 'include' },
        ).then((r) => r.json());
        return { student, combination: res.success ? (res.data as StudentCombination | null) : null };
      }),
    );
    setRows(withCombos);
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
      key: 'combination',
      header: 'Combination',
      value: (r) => r.combination?.combinationCode ?? '',
      render: (r) =>
        r.combination ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default">{r.combination.combinationCode}</Badge>
            <span className="text-xs text-text-muted">
              {r.combination.members
                .map((m) => `${m.subjectCode}${m.role === 'principal' ? '' : ` (${m.role})`}`)
                .join(', ')}
            </span>
            {r.combination.warnings.length > 0 && <Badge variant="accent">check eligibility</Badge>}
          </span>
        ) : (
          <Badge variant="accent">Unassigned</Badge>
        ),
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Combinations</h1>
        <p className="text-sm text-text-muted">
          A-Level students and their subject combination. Assign one for anyone unassigned, or
          reassign as an exception.
        </p>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowActions={(r) => [
          {
            label: r.combination ? 'Reassign' : 'Assign combination',
            icon: Pencil,
            onClick: () => setEditing(r),
          },
        ]}
        rowKey={(r) => r.student.userId}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search students…"
        emptyMessage="No active A-Level students."
        exportFileName="a-level-combinations"
      />

      {editing && editing.student.activeEnrollment && (
        <Modal
          open
          onClose={() => {
            setEditing(null);
            void load();
          }}
          title={`Combination — ${studentFullName(editing.student)}`}
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
            <ALevelCombination
              studentUserId={editing.student.userId}
              enrollment={editing.student.activeEnrollment}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
