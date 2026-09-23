'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { STATUS_LABEL, STATUS_VARIANT, type ReviewStatus } from './types';

/**
 * Where a scheme or plan stands in review, the reviewer's comment, and — for
 * the DOS when it's awaiting review — Approve / Return-with-comment.
 */
export function ReviewPanel({
  status,
  reviewComment,
  reviewedByName,
  canReview,
  onReview,
}: {
  status: ReviewStatus;
  reviewComment: string | null;
  reviewedByName: string | null;
  canReview: boolean;
  onReview: (decision: 'approve' | 'return', comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'return' | null>(null);

  async function review(decision: 'approve' | 'return') {
    setBusy(decision);
    await onReview(decision, comment);
    setBusy(null);
    setComment('');
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        {reviewedByName && status !== 'submitted' && (
          <span className="text-xs text-text-muted">by {reviewedByName}</span>
        )}
      </div>
      {reviewComment && status !== 'submitted' && (
        <p className="text-sm text-text-secondary">
          <span className="font-semibold">Comment: </span>
          <span className="italic">&ldquo;{reviewComment}&rdquo;</span>
        </p>
      )}
      {canReview && status === 'submitted' && (
        <div className="space-y-2 pt-1">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Comment (required when returning it for changes)"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button inline onClick={() => void review('approve')} isLoading={busy === 'approve'} disabled={!!busy}>
              Approve
            </Button>
            <Button
              inline
              variant="outline"
              onClick={() => void review('return')}
              isLoading={busy === 'return'}
              disabled={!!busy || !comment.trim()}
            >
              Return for changes
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
