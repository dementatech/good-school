'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { TermsManager } from '@/components/admin/TermsManager';
import { useToast } from '@/components/ui/ToastProvider';
import { CalendarDays, CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';

interface AcademicYear {
  id: string;
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

const emptyForm = { yearName: '', startDate: '', endDate: '', makeCurrent: false };

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function SchoolAdminAcademicYearsPage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [termsYearId, setTermsYearId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/academic/years');
      const data = await res.json();
      if (data.success) setYears(data.data);
      else toast.error(data.error ?? 'Failed to load academic years.');
    } catch {
      toast.error('Network error while loading academic years.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  const effectiveTermsYearId =
    termsYearId || years.find((y) => y.isCurrent)?.id || years[0]?.id || '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/academic/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Academic year ${form.yearName} created.`);
        setForm(emptyForm);
        setShowForm(false);
        await load();
      } else {
        toast.error(data.error ?? 'Could not create the academic year.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/academic/years/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearName: editing.yearName,
          startDate: editing.startDate,
          endDate: editing.endDate,
          isCurrent: editing.isCurrent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Academic year updated.');
        setEditing(null);
        await load();
      } else {
        toast.error(data.error ?? 'Could not update the academic year.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function makeCurrent(year: AcademicYear) {
    const res = await fetch(`/api/v1/academic/years/${year.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yearName: year.yearName,
        startDate: year.startDate,
        endDate: year.endDate,
        makeCurrent: true,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`${year.yearName} is now the current academic year.`);
      await load();
    } else {
      toast.error(data.error ?? 'Could not switch the current year.');
    }
  }

  async function remove(year: AcademicYear) {
    if (!confirm(`Delete academic year ${year.yearName}? This cannot be undone.`)) return;
    const res = await fetch(`/api/v1/academic/years/${year.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success(`Academic year ${year.yearName} deleted.`);
      await load();
    } else {
      toast.error(data.error ?? 'Could not delete the academic year.');
    }
  }

  const columns: DataTableColumn<AcademicYear>[] = [
    {
      key: 'yearName',
      header: 'Year',
      value: (y) => y.yearName,
      render: (y) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{y.yearName}</span>
          {y.isCurrent && <Badge variant="success">Current</Badge>}
        </span>
      ),
    },
    { key: 'startDate', header: 'Starts', value: (y) => y.startDate, render: (y) => formatDate(y.startDate) },
    { key: 'endDate', header: 'Ends', value: (y) => y.endDate, render: (y) => formatDate(y.endDate) },
  ];

  const rowActions = (y: AcademicYear): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setEditing(y) },
    ...(y.isCurrent
      ? []
      : [{ label: 'Set as current', icon: CheckCircle2, onClick: () => void makeCurrent(y) }]),
    { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onClick: () => void remove(y) },
  ];

  const current = years.find((y) => y.isCurrent);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Academic years &amp; terms</h1>
        <p className="text-sm text-text-muted">
          Your school&apos;s calendar. Uganda runs February–December with three terms. Enrolment
          and every term-scoped record resolves its year and term from here.
        </p>
      </div>

      <Card className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-bg-muted">
          <CalendarDays className="w-5 h-5 text-primary-700" aria-hidden />
        </div>
        <div>
          <p className="text-xs text-text-muted">Current academic year</p>
          <p className="text-lg font-semibold text-primary-900">
            {loading ? '—' : (current?.yearName ?? 'None set')}
          </p>
          {!loading && !current && (
            <p className="text-xs text-[#C26565] mt-0.5">
              Students cannot be enrolled until a current year is set.
            </p>
          )}
        </div>
      </Card>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">New academic year</h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              id="yearName"
              label="Name"
              placeholder="2026"
              value={form.yearName}
              onChange={(e) => setForm({ ...form, yearName: e.target.value })}
              required
            />
            <Input
              id="startDate"
              label="Starts on"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              required
            />
            <Input
              id="endDate"
              label="Ends on"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              required
            />
            <label className="sm:col-span-3 flex items-center gap-2 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={form.makeCurrent}
                onChange={(e) => setForm({ ...form, makeCurrent: e.target.checked })}
                className="rounded border-[#E5E5E5]"
              />
              Make this the current academic year
            </label>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create academic year'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Edit {editing.yearName}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Name"
              value={editing.yearName}
              onChange={(e) => setEditing({ ...editing, yearName: e.target.value })}
              required
            />
            <Input
              label="Starts on"
              type="date"
              value={editing.startDate}
              onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
              required
            />
            <Input
              label="Ends on"
              type="date"
              value={editing.endDate}
              onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
              required
            />
            <div className="sm:col-span-3 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        rows={years}
        columns={columns}
        rowActions={rowActions}
        rowKey={(y) => y.id}
        loading={loading}
        initialSort={{ key: 'startDate', direction: 'desc' }}
        searchPlaceholder="Search academic years…"
        emptyMessage="No academic years yet. Create one to start enrolling students."
        exportFileName="academic-years"
        mobileTitle={(y) => (
          <span className="inline-flex items-center gap-2">
            {y.yearName}
            {y.isCurrent && <Badge variant="success">Current</Badge>}
          </span>
        )}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New year
          </Button>
        }
      />

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-primary-900 mb-1">Terms</h2>
          <p className="text-sm text-text-muted">Up to three terms per academic year.</p>
        </div>

        {years.length === 0 ? (
          <p className="text-sm text-text-muted">Create an academic year first.</p>
        ) : (
          <>
            <div className="mb-4">
              <select
                value={effectiveTermsYearId}
                onChange={(e) => setTermsYearId(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.yearName}
                    {y.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {effectiveTermsYearId && (
              <TermsManager
                key={effectiveTermsYearId}
                apiBasePath="/api/v1/academic/terms"
                academicYearId={effectiveTermsYearId}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
