'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bug, HelpCircle, Lightbulb } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { TicketThread } from './TicketThread';
import {
  KIND_LABEL,
  KIND_SHORT,
  STATUS_LABEL,
  STATUS_VARIANT,
  TEXTAREA_CLASS,
  fmtDateTime,
  type Ticket,
  type TicketDetail,
  type TicketKind,
} from './types';

const KIND_OPTIONS: { kind: TicketKind; icon: typeof Bug; hint: string }[] = [
  { kind: 'problem', icon: Bug, hint: 'An error, a wrong number, a page that won’t load.' },
  { kind: 'feature', icon: Lightbulb, hint: 'Something you need that Good School doesn’t do yet.' },
  { kind: 'question', icon: HelpCircle, hint: 'Not sure how to do something.' },
];

/**
 * Help & Support — the same page in every portal (each portal mounts it at its
 * own /support route so it keeps that portal's shell). Report a problem or ask
 * for a feature; follow what happened to earlier reports. `?ticket=ID` opens
 * one directly, which is where the "resolved" notification links to.
 */
export function SupportPage() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = Number(searchParams.get('ticket')) || null;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TicketDetail | null>(null);

  const [kind, setKind] = useState<TicketKind>('problem');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    setTickets(await fetchList<Ticket>('/api/v1/support/tickets', toast.error));
    setLoading(false);
  }, [toast.error]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetail(await fetchOne<TicketDetail>(`/api/v1/support/tickets/${id}`, toast.error));
    },
    [toast.error],
  );

  useEffect(() => {
    void (async () => {
      await loadList();
    })();
  }, [loadList]);

  useEffect(() => {
    void (async () => {
      if (openId) await loadDetail(openId);
      else setDetail(null);
    })();
  }, [openId, loadDetail]);

  function open(id: number | null) {
    router.push(id ? `${pathname}?ticket=${id}` : pathname);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    const res = await submitJson<Ticket>('/api/v1/support/tickets', 'POST', {
      kind,
      subject,
      description,
      pageUrl: pageUrl.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success('Thanks — your report has been sent. We’ll notify you when it’s resolved.');
    setSubject('');
    setDescription('');
    setPageUrl('');
    await loadList();
  }

  if (openId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <button
          type="button"
          onClick={() => open(null)}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-900"
        >
          <ArrowLeft className="w-4 h-4" /> All my reports
        </button>
        <Card>
          {detail ? (
            <TicketThread
              ticket={detail}
              viewer="reporter"
              onReplied={() => {
                void loadDetail(detail.id);
                void loadList();
              }}
            />
          ) : (
            <div className="py-10 flex justify-center">
              <Loader size={44} />
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Help &amp; Support</h1>
        <p className="text-sm text-text-muted">
          Tell us what isn&apos;t working or what&apos;s missing. Every report goes straight to the Good School
          team, and you&apos;ll get a notification when it&apos;s resolved.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="text-xs font-medium text-[#666666] tracking-wide mb-2">What is this about?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {KIND_OPTIONS.map(({ kind: k, icon: Icon, hint }) => (
                <label
                  key={k}
                  className={`flex cursor-pointer gap-2 rounded-xl border-2 p-3 text-sm transition-colors ${
                    kind === k ? 'border-primary-700 bg-primary-50' : 'border-[#E5E5E5] hover:border-[#D4D4D4]'
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="sr-only"
                  />
                  <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary-700" aria-hidden />
                  <span>
                    <span className="block font-medium text-primary-900">{KIND_LABEL[k]}</span>
                    <span className="block text-xs text-text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Input
            id="support-subject"
            label="Short summary"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            required
            placeholder={kind === 'feature' ? 'e.g. Send report cards to parents by SMS' : 'e.g. Marks page won’t save'}
          />

          <div className="space-y-1.5">
            <label htmlFor="support-description" className="text-xs font-medium text-[#666666] tracking-wide">
              {kind === 'problem' ? 'What happened, and what did you expect?' : 'Details'}
            </label>
            <textarea
              id="support-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={5000}
              required
              className={TEXTAREA_CLASS}
            />
          </div>

          {kind === 'problem' && (
            <Input
              id="support-page"
              label="Which page or screen? (optional)"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              maxLength={500}
              placeholder="e.g. Exams → Enter marks, S2 Biology"
            />
          )}

          <Button type="submit" inline isLoading={submitting} disabled={!subject.trim() || !description.trim()}>
            Send report
          </Button>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-primary-900">My reports</h2>
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader size={36} />
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-text-muted">You haven&apos;t reported anything yet.</p>
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
                  <span className="mt-1 block text-xs text-text-muted">
                    #{t.id} · updated {fmtDateTime(t.updatedAt)}
                    {t.replyCount > 0 && ` · ${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
