'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Loader } from '@/components/ui/loader';
import { BadgeCheck, KeyRound, Layers, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { SchoolFormModal } from '@/components/admin/schools/SchoolFormModal';
import { SchoolCurriculaModal } from '@/components/admin/schools/SchoolCurriculaModal';
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  type OnboardingStatus,
  type School,
} from '@/components/admin/schools/types';

function AdminLoginModal({
  school,
  onClose,
}: {
  school: School;
  onClose: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson<{ admin: { email: string }; tempPassword: string }>(
      `/api/v1/schools/${school.id}/admins`,
      'POST',
      { email: email.trim() },
    );
    setSaving(false);
    if (res.ok && res.data) {
      setCreated({ email: res.data.admin.email, tempPassword: res.data.tempPassword });
    } else {
      toast.error(res.error ?? 'Could not create the admin login.');
    }
  }

  return (
    <Modal open onClose={onClose} title={`School admin login — ${school.name}`}>
      {created ? (
        <CredentialsCard
          name={created.email}
          systemId={null}
          temporaryPassword={created.tempPassword}
          emailSent={false}
          hasEmail
          onDismiss={onClose}
        />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-text-muted">
            Creates a <span className="font-medium">school_admin</span> account that can sign in to
            this school&apos;s portal. A temporary password is shown once.
          </p>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" isLoading={saving}>
              Create login
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function SystemSchoolsPage() {
  const toast = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [formSchool, setFormSchool] = useState<{ school?: School } | null>(null);
  const [curriculaSchool, setCurriculaSchool] = useState<School | null>(null);
  const [adminSchool, setAdminSchool] = useState<School | null>(null);

  const load = useCallback(async () => {
    setSchools(await fetchList<School>('/api/v1/schools'));
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function setStatus(school: School, status: OnboardingStatus, msg: string) {
    const res = await submitJson(`/api/v1/schools/${school.id}/status`, 'POST', { status });
    if (res.ok) {
      toast.success(msg);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  async function remove(school: School) {
    if (!confirm(`Delete ${school.name}? This cannot be undone.`)) return;
    const res = await submitJson(`/api/v1/schools/${school.id}`, 'DELETE');
    if (res.ok) {
      toast.success('School deleted.');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<School>[] = [
    {
      key: 'name',
      header: 'School',
      value: (s) => s.name,
      render: (s) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{s.name}</span>
          {s.emisCode && <Badge variant="muted">EMIS {s.emisCode}</Badge>}
          {s.curricula.map((c) => (
            <span key={c.curriculumId} className="text-xs text-text-faint">
              {c.code}
              {c.isPrimary ? '★' : ''}
            </span>
          ))}
        </span>
      ),
    },
    { key: 'district', header: 'District', value: (s) => s.district ?? '', hideOnMobile: true },
    {
      key: 'schoolType',
      header: 'Type',
      value: (s) => s.schoolType ?? '',
      hideOnMobile: true,
      render: (s) => <span className="capitalize">{s.schoolType ?? '—'}</span>,
    },
    {
      key: 'ownershipType',
      header: 'Ownership',
      value: (s) => s.ownershipType ?? '',
      hideOnMobile: true,
      render: (s) => <span className="capitalize">{s.ownershipType ?? '—'}</span>,
    },
    {
      key: 'onboardingStatus',
      header: 'Status',
      value: (s) => STATUS_LABEL[s.onboardingStatus],
      render: (s) => (
        <Badge variant={STATUS_VARIANT[s.onboardingStatus]}>{STATUS_LABEL[s.onboardingStatus]}</Badge>
      ),
    },
    { key: 'userCount', header: 'Users', value: (s) => s.userCount, align: 'right' },
  ];

  const rowActions = (s: School): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setFormSchool({ school: s }) },
    ...(s.onboardingStatus === 'pending_verification'
      ? [
          {
            label: 'Verify (activate)',
            icon: BadgeCheck,
            onClick: () => void setStatus(s, 'active', `${s.name} verified and active.`),
          },
        ]
      : []),
    ...(s.onboardingStatus === 'suspended'
      ? [
          {
            label: 'Reactivate',
            icon: Play,
            onClick: () => void setStatus(s, 'active', `${s.name} reactivated.`),
          },
        ]
      : [
          {
            label: 'Suspend',
            icon: Pause,
            onClick: () => void setStatus(s, 'suspended', `${s.name} suspended.`),
          },
        ]),
    { label: 'Curricula', icon: Layers, onClick: () => setCurriculaSchool(s) },
    { label: 'Add admin login', icon: KeyRound, onClick: () => setAdminSchool(s) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void remove(s),
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Schools</h1>
        <p className="text-sm text-text-muted">
          The platform&apos;s tenants. A new school is registered as{' '}
          <span className="font-medium">pending verification</span>; activate it once its EMIS code
          / registration is confirmed.
        </p>
      </div>

      <DataTable
        rows={schools}
        columns={columns}
        rowActions={rowActions}
        rowKey={(s) => s.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search schools…"
        emptyMessage="No schools yet. Register the first one."
        exportFileName="schools"
        actions={
          <Button onClick={() => setFormSchool({})}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Register school
          </Button>
        }
      />

      {formSchool && (
        <SchoolFormModal
          open
          onClose={() => setFormSchool(null)}
          onSaved={load}
          school={formSchool.school}
        />
      )}
      {curriculaSchool && (
        <SchoolCurriculaModal
          open
          onClose={() => setCurriculaSchool(null)}
          onSaved={load}
          school={curriculaSchool}
        />
      )}
      {adminSchool && <AdminLoginModal school={adminSchool} onClose={() => setAdminSchool(null)} />}
    </div>
  );
}
