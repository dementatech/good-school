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
import { StaffFormModal } from '@/components/admin/staff/StaffFormModal';
import { StaffDetailModal } from '@/components/admin/staff/StaffDetailModal';
import { STAFF_ROLE_LABEL, staffFullName, type Staff } from '@/components/admin/staff/types';

function ResetPasswordModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const toast = useToast();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await submitJson<Record<string, string>>('/api/v1/staff/reset-passwords', 'POST', {
        userIds: [staff.userId],
      });
      if (res.ok && res.data?.[staff.userId]) {
        setTempPassword(res.data[staff.userId]);
      } else {
        toast.error(res.error ?? 'Could not reset the password.');
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal open onClose={onClose} title={`Reset password — ${staffFullName(staff)}`}>
      {tempPassword ? (
        <CredentialsCard
          name={staffFullName(staff)}
          systemId={staff.systemId}
          temporaryPassword={tempPassword}
          emailSent={false}
          hasEmail={Boolean(staff.email)}
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

export default function SchoolAdminStaffPage() {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [formStaff, setFormStaff] = useState<{ staff?: Staff } | null>(null);
  const [viewing, setViewing] = useState<Staff | null>(null);
  const [resetting, setResetting] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setStaff(await fetchList<Staff>('/api/v1/staff'));
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function toggleActive(s: Staff) {
    const action = s.isActive ? 'archive' : 'restore';
    const res = await submitJson(`/api/v1/staff/${s.userId}/${action}`, 'POST');
    if (res.ok) {
      toast.success(s.isActive ? `${staffFullName(s)} deactivated.` : `${staffFullName(s)} restored.`);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<Staff>[] = [
    {
      key: 'name',
      header: 'Staff member',
      value: (s) => staffFullName(s),
      render: (s) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{staffFullName(s)}</span>
          {s.systemId && <Badge variant="muted">{s.systemId}</Badge>}
          {!s.isActive && <Badge variant="muted">Inactive</Badge>}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      value: (s) => (s.activeAssignment ? STAFF_ROLE_LABEL[s.activeAssignment.role] : ''),
      render: (s) =>
        s.activeAssignment ? (
          <span>{STAFF_ROLE_LABEL[s.activeAssignment.role]}</span>
        ) : (
          <span className="text-text-faint italic">Not assigned</span>
        ),
    },
    {
      key: 'tmis',
      header: 'TMIS',
      value: (s) => s.tmisNumber ?? '',
      hideOnMobile: true,
      render: (s) => s.tmisNumber ?? <span className="text-text-faint">Not registered</span>,
    },
    {
      key: 'specializations',
      header: 'Specializes in',
      value: (s) => s.specializations.map((sp) => sp.subjectName).join(', '),
      hideOnMobile: true,
      render: (s) =>
        s.specializations.length > 0 ? (
          <span className="text-xs text-text-muted">{s.specializations.map((sp) => sp.subjectCode).join(', ')}</span>
        ) : (
          <span className="text-text-faint">—</span>
        ),
    },
    { key: 'phone', header: 'Phone', value: (s) => s.phoneNumber ?? '', hideOnMobile: true },
  ];

  const rowActions = (s: Staff): DropdownMenuItem[] => [
    { label: 'View', icon: Eye, onClick: () => setViewing(s) },
    { label: 'Edit', icon: Pencil, onClick: () => setFormStaff({ staff: s }) },
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Staff</h1>
        <p className="text-sm text-text-muted">
          Hiring a staff member captures their identity and their role at this school for this year,
          in one step. Assign them to teach a subject from the Subjects & Combinations page.
        </p>
      </div>

      <DataTable
        rows={staff}
        columns={columns}
        rowActions={rowActions}
        rowKey={(s) => s.userId}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search staff…"
        emptyMessage="No staff yet. Hire the first one."
        exportFileName="staff"
        actions={
          <Button onClick={() => setFormStaff({})}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Hire staff member
          </Button>
        }
      />

      {formStaff && (
        <StaffFormModal
          open
          onClose={() => setFormStaff(null)}
          onSaved={load}
          staff={formStaff.staff}
        />
      )}
      {viewing && (
        <StaffDetailModal
          open
          onClose={() => setViewing(null)}
          onChanged={load}
          staff={viewing}
        />
      )}
      {resetting && <ResetPasswordModal staff={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
