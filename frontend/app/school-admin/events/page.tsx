'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { EventFormModal } from '@/components/admin/events/EventFormModal';
import {
  EVENT_AUDIENCE_LABEL,
  EVENT_TYPE_LABEL,
  submitJson,
  type SchoolEvent,
  type SchoolEventType,
} from '@/components/admin/events/types';

// A year either side of today — plenty for planning ahead and looking back,
// without needing a date-range picker for a v1 calendar management page.
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, 0, 1);
  const to = new Date(now.getFullYear() + 1, 11, 31);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString();

export default function SchoolAdminEventsPage() {
  const toast = useToast();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ initial?: SchoolEvent } | null>(null);

  const load = useCallback(async () => {
    const { from, to } = defaultRange();
    const rows = await fetchList<SchoolEvent>(`/api/v1/events?from=${from}&to=${to}`, toast.error);
    setEvents(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function remove(e: SchoolEvent) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const res = await submitJson(`/api/v1/events/${e.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Event deleted.');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<SchoolEvent>[] = [
    {
      key: 'title',
      header: 'Event',
      value: (e) => e.title,
      render: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>
            <span className="font-medium">{e.title}</span>
            {e.description && <p className="text-xs text-text-muted">{e.description}</p>}
          </span>
          {e.schoolId === null && <Badge variant="accent">Platform-wide</Badge>}
          {e.schoolExamId && <Badge variant="muted">Auto — from exam</Badge>}
        </span>
      ),
    },
    { key: 'eventDate', header: 'Date', value: (e) => e.eventDate, render: (e) => fmt(e.eventDate) },
    {
      key: 'eventType',
      header: 'Type',
      value: (e) => EVENT_TYPE_LABEL[e.eventType],
      render: (e) => <Badge variant="muted">{EVENT_TYPE_LABEL[e.eventType]}</Badge>,
    },
    {
      key: 'audience',
      header: 'Visible to',
      value: (e) => EVENT_AUDIENCE_LABEL[e.audience],
      hideOnMobile: true,
      render: (e) => <Badge variant={e.audience === 'all' ? 'default' : 'accent'}>{EVENT_AUDIENCE_LABEL[e.audience]}</Badge>,
    },
  ];

  const filters: DataTableFilter<SchoolEvent>[] = [
    {
      key: 'eventType',
      label: 'Type',
      options: Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      matches: (e, value) => e.eventType === (value as SchoolEventType),
    },
  ];

  const rowActions = (e: SchoolEvent): DropdownMenuItem[] => {
    if (e.schoolId === null) {
      return [{ label: 'Managed platform-wide — edit in System Admin', onClick: () => {}, disabled: true }];
    }
    if (e.schoolExamId) {
      return [{ label: 'Synced from an exam — edit the exam instead', onClick: () => {}, disabled: true }];
    }
    return [
      { label: 'Edit', icon: Pencil, onClick: () => setModal({ initial: e }) },
      { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onClick: () => void remove(e) },
    ];
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Events</h1>
        <p className="text-sm text-text-muted">
          The school calendar — holidays, meetings, and deadlines. Shows up on every dashboard&apos;s
          mini calendar, filtered to who each event is visible to.
        </p>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader size={44} />
        </div>
      ) : (
        <DataTable
          rows={events}
          columns={columns}
          filters={filters}
          rowActions={rowActions}
          rowKey={(e) => e.id}
          initialSort={{ key: 'eventDate', direction: 'asc' }}
          emptyMessage="No events yet."
          exportFileName="events"
          actions={
            <Button onClick={() => setModal({})}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              Add event
            </Button>
          }
        />
      )}

      {modal && <EventFormModal open onClose={() => setModal(null)} onSaved={load} initial={modal.initial} />}
    </div>
  );
}
