'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, fetchList } from '@/lib/api/envelope';
import { KeyRound, Power, PowerOff, UserPlus } from 'lucide-react';
import type { GuardianAccountRecord } from './types';

const CREATE_ERROR: Record<string, string> = {
  no_contact: 'This guardian has no phone or email on file. Add one to their record first.',
  identifier_in_use: 'Another parent login already uses this guardian’s phone or email — resolve that first.',
  account_exists: 'This guardian already has a login.',
};

export function ParentsTab() {
  const toast = useToast();
  const [rows, setRows] = useState<GuardianAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<
    { name: string; systemId: string | null; temporaryPassword: string; hasEmail: boolean } | null
  >(null);

  // setState only after the first await — keeps react-hooks/set-state-in-effect
  // quiet (see the repo's notes on this pattern).
  const load = useCallback(async () => {
    const data = await fetchList<GuardianAccountRecord>('/api/v1/admin/accounts/parents');
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function createLogin(g: GuardianAccountRecord) {
    if (!confirm(`Issue a login for ${g.name}? They'll sign in with their ${g.phone ? 'phone number' : 'email'} and a one-time password.`))
      return;
    setBusyId(g.guardianId);
    const res = await submitJson<{ temporaryPassword: string; phoneNumber: string | null; email: string | null }>(
      `/api/v1/admin/accounts/parents/${g.guardianId}/login`,
      'POST',
    );
    setBusyId(null);
    if (res.ok && res.data) {
      setRevealed({
        name: g.name,
        systemId: res.data.phoneNumber ?? res.data.email,
        temporaryPassword: res.data.temporaryPassword,
        hasEmail: !!res.data.email,
      });
      toast.success(`Login created for ${g.name}.`);
      await load();
    } else {
      toast.error(CREATE_ERROR[res.error ?? ''] ?? res.error ?? 'Could not create the login.');
    }
  }

  async function resetPassword(g: GuardianAccountRecord) {
    if (!g.userId) return;
    if (!confirm(`Reset ${g.name}'s password?`)) return;
    setBusyId(g.guardianId);
    const res = await submitJson<{ temporaryPassword: string }>(
      `/api/v1/admin/accounts/${g.userId}/reset-password`,
      'POST',
    );
    setBusyId(null);
    if (res.ok && res.data) {
      setRevealed({
        name: g.name,
        systemId: g.phone ?? g.email,
        temporaryPassword: res.data.temporaryPassword,
        hasEmail: !!g.email,
      });
      setRows((cur) => cur.map((r) => (r.guardianId === g.guardianId ? { ...r, mustChangePassword: true } : r)));
      toast.success(`Password reset for ${g.name}.`);
    } else {
      toast.error(res.error ?? 'Reset failed.');
    }
  }

  async function toggleActive(g: GuardianAccountRecord) {
    if (!g.userId) return;
    const next = !g.isActive;
    const res = await submitJson(`/api/v1/admin/accounts/${g.userId}`, 'PATCH', { isActive: next });
    if (res.ok) {
      setRows((cur) => cur.map((r) => (r.guardianId === g.guardianId ? { ...r, isActive: next } : r)));
      toast.success(`${g.name} ${next ? 'reactivated' : 'deactivated'}.`);
    } else {
      toast.error(res.error ?? 'Failed to update account.');
    }
  }

  const columns: DataTableColumn<GuardianAccountRecord>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Guardian',
        value: (g) => g.name,
        render: (g) => (
          <span className="min-w-0">
            <span className="font-medium block truncate">{g.name}</span>
            <span className="flex flex-wrap gap-1 mt-0.5">
              {g.userId ? (
                g.isActive ? (
                  <Badge variant="success">Login active</Badge>
                ) : (
                  <Badge variant="muted">Login deactivated</Badge>
                )
              ) : (
                <Badge variant="default">No login</Badge>
              )}
              {g.userId && g.isActive && g.mustChangePassword && (
                <Badge variant="accent">Pending first sign-in</Badge>
              )}
            </span>
          </span>
        ),
      },
      { key: 'phone', header: 'Phone', value: (g) => g.phone ?? '—' },
      { key: 'email', header: 'Email', value: (g) => g.email ?? '—', hideOnMobile: true },
      {
        key: 'children',
        header: 'Children',
        value: (g) => g.students.map((s) => s.name).join(', '),
        render: (g) =>
          g.students.length === 0 ? (
            <span className="text-text-muted">—</span>
          ) : (
            <span className="text-xs">
              {g.students.map((s) => s.name).join(', ')}
            </span>
          ),
      },
      {
        key: 'schools',
        header: 'School(s)',
        value: (g) => g.schools.join(', '),
        hideOnMobile: true,
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (g: GuardianAccountRecord): DropdownMenuItem[] => {
      if (!g.userId) {
        return [
          {
            label: 'Create login',
            icon: UserPlus,
            disabled: busyId === g.guardianId,
            onClick: () => void createLogin(g),
          },
        ];
      }
      return [
        {
          label: 'Reset password',
          icon: KeyRound,
          disabled: busyId === g.guardianId,
          onClick: () => void resetPassword(g),
        },
        {
          label: g.isActive ? 'Deactivate login' : 'Reactivate login',
          icon: g.isActive ? PowerOff : Power,
          separatorBefore: true,
          danger: !!g.isActive,
          onClick: () => void toggleActive(g),
        },
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId],
  );

  return (
    <div className="space-y-4">
      {revealed && (
        <CredentialsCard {...revealed} emailSent={false} onDismiss={() => setRevealed(null)} />
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowActions={rowActions}
        rowKey={(g) => g.guardianId}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search guardians by name, phone, email or child…"
        emptyMessage="No guardians on file yet."
        exportFileName="parent-accounts"
        mobileTitle={(g) => g.name}
        filters={[
          {
            key: 'login',
            label: 'Login',
            options: [
              { value: 'yes', label: 'Has login' },
              { value: 'no', label: 'No login' },
              { value: 'inactive', label: 'Deactivated' },
            ],
            matches: (g, v) =>
              v === 'yes' ? !!g.userId : v === 'no' ? !g.userId : !!g.userId && !g.isActive,
          },
        ]}
      />
    </div>
  );
}
