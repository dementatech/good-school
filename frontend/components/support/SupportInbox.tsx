'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Mail, Phone, School, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import { TicketThread } from './TicketThread';
import {
  KIND_SHORT,
  ROLE_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  TEXTAREA_CLASS,
  fmtDateTime,
  type Ticket,
  type TicketDetail,
  type TicketKind,
  type TicketStatus,
} from './types';

type Counts = Record<TicketStatus, number>;
type StatusTab = TicketStatus | 'all';

const TABS: StatusTab[] = ['open', 'in_progress', 'resolved', 'closed', 'all'];

/**
 * The platform owner's support inbox: every report from every school, worked
 * through open → in progress → resolved. Resolving (or replying) notifies the
 * reporter in-app, by push, and by email when they have one.
 */
export function SupportInbox() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = Number(searchParams.get('ticket')) || null;

  const [tab, setTab] = useState<StatusTab>('open');
  const [kind, setKind] = useState<TicketKind | ''>('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TicketDetail | null>(null);

  const loadInbox = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('status', tab);
    if (kind) params.set('kind', kind);
    const data = await fetchOne<{ tickets: Ticket[]; counts: Counts }>(
      `/api/v1/support/inbox?${params}`,
      toast.error,
    );
    if (data) {
      setTickets(data.tickets);
      setCounts(data.counts);
    }
    setLoading(false);
  }, [tab, kind, toast.error]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetail(await fetchOne<TicketDetail>(`/api/v1/support/tickets/${id}`, toast.error));
    },
    [toast.error],
  );

  useEffect(() => {
    void (async () => {
      await loadInbox();
    })();
  }, [loadInbox]);

  useEffect(() => {
    void (async () => {
      if (openId) await loadDetail(openId);
      else setDetail(null);
    })();
  }, [openId, loadDetail]);

  function open(id: number | null) {
    router.push(id ? `${pathname}?ticket=${id}` : pathname);
  }

  const total = counts.open + counts.in_progress + counts.resolved + counts.closed;

  if (openId) {
    return (
      <div className="space-y-4 max-w-5xl">
        <button
          type="button"
          onClick={() => open(null)}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-900"
        >
          <ArrowLeft className="w-4 h-4" /> Support inbox
        </button>
        {detail ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
            <Card>
              <TicketThread
                ticket={detail}
                viewer="support"
                onReplied={() => {
                  void loadDetail(detail.id);
                  void loadInbox();
                }}
              />
            </Card>
            <div className="space-y-4">
              <ReporterCard ticket={detail} />
              <StatusPanel
                ticket={detail}
                onUpdated={(updated) => {
                  setDetail(updated);
                  void loadInbox();
                }}
              />
            </div>
          </div>
        ) : (
          <div className="py-10 flex justify-center">
            <Loader size={44} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Support Inbox</h1>
        <p className="text-sm text-text-muted">
          Problems and feature requests reported from every school. Resolving one notifies the person who
          reported it.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          tabs={TABS.map((key) => ({
            key,
            label: key === 'all' ? 'All' : STATUS_LABEL[key],
            count: key === 'all' ? total : counts[key],
          }))}
          active={tab}
          onChange={(key) => setTab(key as StatusTab)}
        />
        <div className="sm:w-48">
          <Select
            aria-label="Filter by type"
            value={kind}
            onChange={(e) => setKind(e.target.value as TicketKind | '')}
            options={[
              { value: '', label: 'All types' },
              { value: 'problem', label: 'Problems' },
              { value: 'feature', label: 'Feature requests' },
              { value: 'question', label: 'Questions' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader size={44} />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted text-center py-6">
            {tab === 'open' ? 'Nothing open — every report has been dealt with.' : 'No reports here.'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => open(t.id)}
                className="w-full text-left rounded-xl border border-[#EAEAEA] bg-white px-4 py-3 hover:border-[#D4D4D4] transition-colors"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  <Badge variant="muted">{KIND_SHORT[t.kind]}</Badge>
                  <span className="font-medium text-primary-900 break-words min-w-0">{t.subject}</span>
                </span>
                <span className="mt-1 block text-xs text-text-muted break-words">
                  #{t.id} · {reporterLine(t)} · {fmtDateTime(t.createdAt)}
                  {t.replyCount > 0 && ` · ${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function reporterLine(t: Ticket): string {
  const r = t.reporter;
  if (!r) return '';
  const who = r.name || r.email || r.systemId || r.phoneNumber || 'Unknown';
  return [who, ROLE_LABEL[r.role] ?? r.role, r.schoolName].filter(Boolean).join(' · ');
}

function ReporterCard({ ticket }: { ticket: Ticket }) {
  const r = ticket.reporter;
  if (!r) return null;
  return (
    <Card>
      <h3 className="text-sm font-semibold text-primary-900 mb-3">Reported by</h3>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <UserRound className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
          <span className="break-words min-w-0">
            {r.name || r.systemId || 'Unnamed account'}
            <span className="block text-xs text-text-muted">
              {ROLE_LABEL[r.role] ?? r.role}
              {r.systemId && r.name ? ` · ${r.systemId}` : ''}
            </span>
          </span>
        </li>
        {r.schoolName && (
          <li className="flex items-start gap-2">
            <School className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
            <span className="break-words min-w-0">{r.schoolName}</span>
          </li>
        )}
        {r.email && (
          <li className="flex items-start gap-2">
            <Mail className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
            <a href={`mailto:${r.email}`} className="break-all text-primary-700 hover:underline">
              {r.email}
            </a>
          </li>
        )}
        {r.phoneNumber && (
          <li className="flex items-start gap-2">
            <Phone className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
            <a href={`tel:${r.phoneNumber}`} className="text-primary-700 hover:underline">
              {r.phoneNumber}
            </a>
          </li>
        )}
      </ul>
    </Card>
  );
}

function StatusPanel({ ticket, onUpdated }: { ticket: TicketDetail; onUpdated: (t: TicketDetail) => void }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<TicketStatus | null>(null);

  async function update(status: TicketStatus) {
    setSaving(status);
    const res = await submitJson<TicketDetail>(`/api/v1/support/inbox/${ticket.id}`, 'PATCH', {
      status,
      message: message.trim() || null,
    });
    setSaving(null);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    setMessage('');
    toast.success(
      status === 'resolved' ? 'Marked resolved — the reporter has been notified.' : `Marked ${STATUS_LABEL[status].toLowerCase()}.`,
    );
    onUpdated(res.data!);
  }

  const done = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <Card>
      <h3 className="text-sm font-semibold text-primary-900 mb-1">Status</h3>
      <p className="text-xs text-text-muted mb-3">
        {ticket.resolvedAt ? `Resolved ${fmtDateTime(ticket.resolvedAt)}` : `Updated ${fmtDateTime(ticket.updatedAt)}`}
      </p>
      <label htmlFor={`status-note-${ticket.id}`} className="text-xs font-medium text-[#666666] tracking-wide">
        Note to the reporter (optional)
      </label>
      <textarea
        id={`status-note-${ticket.id}`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder="e.g. Fixed — refresh the page and try again."
        className={`${TEXTAREA_CLASS} mt-1.5 mb-3`}
      />
      <div className="flex flex-col gap-2">
        {!done && (
          <Button onClick={() => update('resolved')} isLoading={saving === 'resolved'} disabled={saving !== null}>
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Resolve &amp; notify
          </Button>
        )}
        {ticket.status === 'open' && (
          <Button
            variant="outline"
            onClick={() => update('in_progress')}
            isLoading={saving === 'in_progress'}
            disabled={saving !== null}
          >
            Mark in progress
          </Button>
        )}
        {!done && (
          <Button variant="ghost" onClick={() => update('closed')} isLoading={saving === 'closed'} disabled={saving !== null}>
            Close without fixing
          </Button>
        )}
        {done && (
          <Button variant="outline" onClick={() => update('open')} isLoading={saving === 'open'} disabled={saving !== null}>
            Reopen
          </Button>
        )}
      </div>
    </Card>
  );
}
