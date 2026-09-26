'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import {
  KIND_SHORT,
  STATUS_LABEL,
  STATUS_VARIANT,
  TEXTAREA_CLASS,
  fmtDateTime,
  type TicketDetail,
} from './types';

/**
 * One ticket: what was reported, then the conversation under it. Shared by the
 * reporter's support page and the owner's inbox — `viewer` only decides which
 * side of the conversation is "you".
 */
export function TicketThread({
  ticket,
  viewer,
  onReplied,
  canReply = true,
}: {
  ticket: TicketDetail;
  viewer: 'reporter' | 'support';
  onReplied: () => void;
  canReply?: boolean;
}) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    const res = await submitJson(`/api/v1/support/tickets/${ticket.id}/replies`, 'POST', { body: reply });
    setSending(false);
    if (res.ok) {
      setReply('');
      onReplied();
    } else {
      toast.error(res.error!);
    }
  }

  const reopensOnReply = viewer === 'reporter' && (ticket.status === 'resolved' || ticket.status === 'closed');

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant={STATUS_VARIANT[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
          <Badge variant="muted">{KIND_SHORT[ticket.kind]}</Badge>
          <span className="text-xs text-text-muted">#{ticket.id} · {fmtDateTime(ticket.createdAt)}</span>
        </div>
        <h2 className="text-lg font-semibold text-primary-900 break-words">{ticket.subject}</h2>
        <p className="mt-2 text-sm whitespace-pre-wrap break-words">{ticket.description}</p>
        {ticket.pageUrl && (
          <p className="mt-2 text-xs text-text-muted break-words">Where: {ticket.pageUrl}</p>
        )}
      </div>

      {ticket.replies.length > 0 && (
        <ol className="space-y-3 border-t border-border pt-4">
          {ticket.replies.map((r) => {
            const mine = (viewer === 'support') === r.fromSupport;
            return (
              <li
                key={r.id}
                className={`rounded-xl px-4 py-3 text-sm ${mine ? 'bg-primary-50 ml-6' : 'bg-bg-muted mr-6'}`}
              >
                <p className="text-xs font-medium text-text-muted mb-1">
                  {r.fromSupport ? 'Good School Support' : viewer === 'support' ? 'Reporter' : 'You'} ·{' '}
                  {fmtDateTime(r.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words">{r.body}</p>
              </li>
            );
          })}
        </ol>
      )}

      {canReply && (
        <div className="space-y-2 border-t border-border pt-4">
          <label htmlFor={`reply-${ticket.id}`} className="text-xs font-medium text-[#666666] tracking-wide">
            {viewer === 'support' ? 'Reply to the reporter' : 'Add more detail'}
          </label>
          <textarea
            id={`reply-${ticket.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={5000}
            className={TEXTAREA_CLASS}
          />
          {reopensOnReply && (
            <p className="text-xs text-text-muted">Replying reopens this report so support sees it again.</p>
          )}
          <Button inline onClick={send} isLoading={sending} disabled={!reply.trim()}>
            Send reply
          </Button>
        </div>
      )}
    </div>
  );
}
