'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { submitJson, fetchList } from '@/lib/api/envelope';
import { chunk } from '@/lib/chunk';
import { KeyRound, Pencil, Power, PowerOff, X } from 'lucide-react';
import {
  ROOT_SUPER_ADMIN_EMAIL,
  accountDisplayName,
  type AccountRecord,
  type AccountTab,
} from './types';

interface School {
  id: string;
  name: string;
}

const DISABLE_REASON: Record<string, string> = {
  cannot_disable_self: 'You cannot deactivate your own account.',
  last_super_admin: 'At least one active super admin must remain.',
  identifier_in_use: 'That email or phone is already used by another account.',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserAccountsTab({ type }: { type: Exclude<AccountTab, 'parents'> }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<AccountRecord[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<
    { name: string; systemId: string | null; temporaryPassword: string; hasEmail: boolean } | null
  >(null);
  const [editing, setEditing] = useState<AccountRecord | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // No setState before the first await — a synchronous setState at the top of
  // the effect trips react-hooks/set-state-in-effect (see the repo's notes on
  // this pattern). `loading` starts true; the tab is remounted per `type` via
  // a `key` on the parent, so it resets naturally.
  const load = useCallback(async () => {
    const [accts, schoolList] = await Promise.all([
      fetchList<AccountRecord>(`/api/v1/admin/accounts/${type}`),
      type === 'staff' ? fetchList<School>('/api/v1/schools') : Promise.resolve([]),
    ]);
    setRows(accts);
    setSchools(schoolList);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  const isRoot = (a: AccountRecord) => a.email === ROOT_SUPER_ADMIN_EMAIL;

  async function resetPassword(a: AccountRecord) {
    if (!confirm(`Reset the password for ${accountDisplayName(a)}? Their current password stops working and they must set a new one on next sign-in.`))
      return;
    setBusyId(a.id);
    const res = await submitJson<{ temporaryPassword: string }>(
      `/api/v1/admin/accounts/${a.id}/reset-password`,
      'POST',
    );
    setBusyId(null);
    if (res.ok && res.data) {
      setRevealed({
        name: accountDisplayName(a),
        systemId: a.systemId,
        temporaryPassword: res.data.temporaryPassword,
        hasEmail: !!a.email,
      });
      setRows((cur) => cur.map((r) => (r.id === a.id ? { ...r, mustChangePassword: true } : r)));
      toast.success(`Password reset for ${accountDisplayName(a)}.`);
    } else {
      toast.error(res.error ?? 'Reset failed.');
    }
  }

  async function toggleActive(a: AccountRecord) {
    const next = !a.isActive;
    const res = await submitJson<AccountRecord>(`/api/v1/admin/accounts/${a.id}`, 'PATCH', {
      isActive: next,
    });
    if (res.ok) {
      setRows((cur) => cur.map((r) => (r.id === a.id ? { ...r, isActive: next } : r)));
      toast.success(`${accountDisplayName(a)} ${next ? 'reactivated' : 'deactivated'}.`);
    } else {
      toast.error(DISABLE_REASON[res.error ?? ''] ?? res.error ?? 'Failed to update account.');
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    const res = await submitJson<AccountRecord>(`/api/v1/admin/accounts/${editing.id}`, 'PATCH', {
      email: editing.email ?? '',
      phoneNumber: editing.phoneNumber ?? '',
    });
    setSavingEdit(false);
    if (res.ok) {
      setRows((cur) => cur.map((r) => (r.id === editing.id ? { ...r, email: editing.email, phoneNumber: editing.phoneNumber } : r)));
      setEditing(null);
      toast.success('Contact details updated.');
    } else {
      toast.error(DISABLE_REASON[res.error ?? ''] ?? res.error ?? 'Failed to update.');
    }
  }

  async function fetchPasswordsForExport(
    exportRows: AccountRecord[],
    onProgress: (done: number, total: number) => void,
  ): Promise<Record<string, string>> {
    const passwords: Record<string, string> = {};
    let done = 0;
    let failed = 0;
    for (const batch of chunk(exportRows, 10)) {
      const results = await submitJson<Record<string, string>>(
        '/api/v1/admin/accounts/reset-passwords',
        'POST',
        { userIds: batch.map((b) => b.id) },
      );
      for (const b of batch) {
        const pw = results.ok ? results.data?.[b.id] ?? '' : '';
        passwords[b.id] = pw;
        if (!pw) failed += 1;
      }
      done += batch.length;
      onProgress(done, exportRows.length);
    }
    if (failed > 0) toast.warning(`${failed} reset(s) failed — those rows are blank in the export.`);
    await load();
    return passwords;
  }

  const showSchool = type === 'staff';
  const showSystemId = type === 'staff' || type === 'students';
  const showClass = type === 'students';

  const columns: DataTableColumn<AccountRecord>[] = useMemo(() => {
    const cols: DataTableColumn<AccountRecord>[] = [
      {
        key: 'name',
        header: type === 'school-admins' || type === 'super-admins' ? 'Account' : 'Name',
        value: (a) => accountDisplayName(a),
        render: (a) => (
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-full bg-bg-muted text-text-muted text-xs font-medium flex items-center justify-center shrink-0">
              {initials(accountDisplayName(a)) || '—'}
            </span>
            <span className="min-w-0">
              <span className="font-medium block truncate">{accountDisplayName(a)}</span>
              <span className="flex flex-wrap gap-1 mt-0.5">
                {isRoot(a) && <Badge variant="default">Root — protected</Badge>}
                {a.id === user?.id && <Badge variant="muted">You</Badge>}
                {a.role === 'admin' && <Badge variant="default">Platform admin</Badge>}
                {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
                {a.isActive && a.mustChangePassword && <Badge variant="accent">Pending first sign-in</Badge>}
              </span>
            </span>
          </span>
        ),
      },
    ];
    if (showSystemId) cols.push({ key: 'systemId', header: 'System ID', value: (a) => a.systemId ?? '—' });
    cols.push({ key: 'email', header: 'Email', value: (a) => a.email ?? '—' });
    cols.push({ key: 'phoneNumber', header: 'Phone', value: (a) => a.phoneNumber ?? '—', hideOnMobile: true });
    if (showSchool) cols.push({ key: 'schoolName', header: 'School', value: (a) => a.schoolName ?? '—' });
    if (showClass) cols.push({ key: 'className', header: 'Class', value: (a) => a.className ?? '—' });
    return cols;
  }, [type, showSystemId, showSchool, showClass, user?.id]);

  const rowActions = useCallback(
    (a: AccountRecord): DropdownMenuItem[] => {
      const items: DropdownMenuItem[] = [
        {
          label: 'Reset password',
          icon: KeyRound,
          disabled: busyId === a.id,
          onClick: () => void resetPassword(a),
        },
        { label: 'Edit contact', icon: Pencil, onClick: () => setEditing(a) },
      ];
      if (!isRoot(a)) {
        items.push({
          label: a.isActive ? 'Deactivate account' : 'Reactivate account',
          icon: a.isActive ? PowerOff : Power,
          separatorBefore: true,
          danger: a.isActive,
          onClick: () => void toggleActive(a),
        });
      }
      return items;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId],
  );

  const filters = useMemo(() => {
    const f: {
      key: string;
      label: string;
      options: { value: string; label: string }[];
      matches: (a: AccountRecord, v: string) => boolean;
    }[] = [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Deactivated' },
          { value: 'pending', label: 'Pending first sign-in' },
        ],
        matches: (a, v) =>
          v === 'active' ? a.isActive : v === 'inactive' ? !a.isActive : a.isActive && a.mustChangePassword,
      },
    ];
    if (showSchool && schools.length > 0) {
      f.push({
        key: 'school',
        label: 'School',
        options: schools.map((s) => ({ value: s.name, label: s.name })),
        matches: (a, v) => a.schoolName === v,
      });
    }
    return f;
  }, [showSchool, schools]);

  return (
    <div className="space-y-4">
      {revealed && (
        <CredentialsCard
          {...revealed}
          emailSent={false}
          onDismiss={() => setRevealed(null)}
        />
      )}

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Edit contact — {accountDisplayName(editing)}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                value={editing.email ?? ''}
                onChange={(e) => setEditing({ ...editing, email: e.target.value || null })}
              />
              <Input
                label="Phone"
                value={editing.phoneNumber ?? ''}
                onChange={(e) => setEditing({ ...editing, phoneNumber: e.target.value || null })}
              />
            </div>
            <p className="text-xs text-text-muted">
              Contact details only. Name, role and System ID are managed where the person&apos;s record lives
              (roster, onboarding).
            </p>
            <div className="flex gap-2">
              <Button type="submit" isLoading={savingEdit}>Save</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowActions={rowActions}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search by name, ID, email, phone or school…"
        emptyMessage="No accounts here yet."
        exportFileName={`${type}-accounts`}
        mobileTitle={(a) => accountDisplayName(a)}
        filters={filters}
        passwordColumn={{
          label: 'Temporary password',
          confirmMessage: (count) =>
            `This resets the password for ${count} account(s) and puts the new one in the export — their previous password stops working and they'll be asked to set a new one on next sign-in. Continue?`,
          fetchPasswords: fetchPasswordsForExport,
        }}
      />
    </div>
  );
}
