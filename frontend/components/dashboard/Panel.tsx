import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/kit/card';
import { Skeleton } from '@/components/kit/skeleton';

/**
 * The one container for dashboard content. Loading and empty states live here
 * so every panel handles them the same way.
 */
export function Panel({
  icon: Icon,
  title,
  description,
  action,
  loading = false,
  empty,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  loading?: boolean;
  /** Shown instead of the content when set, once loading has finished. */
  empty?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 min-w-0">
          <span className="size-9 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Loading">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
