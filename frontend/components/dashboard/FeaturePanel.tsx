import type { ReactNode } from 'react';
import { Skeleton } from '@/components/kit/skeleton';

/**
 * The one block a dashboard leads with: a solid navy surface with a large
 * headline figure. Use at most one per page, or nothing stands out. Navy is
 * `primary-900`, which a school's brand colour never changes.
 */
export function FeaturePanel({
  title,
  description,
  figure,
  figureLabel,
  loading = false,
  empty,
  children,
}: {
  title: string;
  description?: string;
  figure?: ReactNode;
  figureLabel?: string;
  loading?: boolean;
  empty?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="h-full rounded-card bg-primary-900 p-4 sm:p-6 text-white shadow-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-white/70 mt-0.5">{description}</p>}
        </div>
        {figure !== undefined && !loading && (
          <div className="text-right shrink-0">
            <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-none">{figure}</p>
            {figureLabel && <p className="text-xs text-white/70 mt-1">{figureLabel}</p>}
          </div>
        )}
      </div>
      {loading ? (
        <div role="status" aria-label="Loading">
          <Skeleton className="h-56 w-full bg-white/10" />
        </div>
      ) : empty ? (
        <p className="text-sm text-white/70">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}
