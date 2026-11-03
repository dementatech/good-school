import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/kit/card';
import { Skeleton } from '@/components/kit/skeleton';

/** A single headline number. Links to the page behind it when `href` is set. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  href,
  loading = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  href?: string;
  loading?: boolean;
}) {
  const card = (
    <Card className="h-full gap-3 p-4 sm:p-5 transition-shadow group-hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
        {href && (
          <ArrowUpRight className="size-4 text-text-faint shrink-0 transition-colors group-hover:text-primary-600" aria-hidden />
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="hidden xs:flex size-8 rounded-full border border-border text-text-secondary items-center justify-center shrink-0">
          <Icon className="size-4" aria-hidden />
        </span>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold text-primary-900 tabular-nums">{value}</p>
        )}
      </div>
    </Card>
  );

  return href ? (
    <Link
      href={href}
      className="group block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      {card}
    </Link>
  ) : (
    card
  );
}

/** Two across on a phone, four on a wide screen. */
export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3 sm:mb-4">{children}</div>;
}

/** Text in place of a number: where a tile points somewhere rather than counts. */
export function ShortcutCard({
  icon: Icon,
  label,
  description,
  href,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  href?: string;
}) {
  const card = (
    <Card className="h-full gap-1 p-4 sm:p-5 transition-shadow group-hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 text-primary-600 shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-primary-900">{label}</span>
        </span>
        {href && <ArrowUpRight className="size-4 text-text-faint shrink-0" aria-hidden />}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="group block h-full rounded-card">
      {card}
    </Link>
  ) : (
    card
  );
}
