import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/kit/card';
import { Skeleton } from '@/components/kit/skeleton';

/** The icon tile's colour. `success` and `warning` report a state, so use them only for that. */
export type MetricTone = 'primary' | 'navy' | 'accent' | 'success' | 'warning';

const TONE_CLASSES: Record<MetricTone, string> = {
  primary: 'bg-primary-700 text-white',
  navy: 'bg-primary-900 text-white',
  // White fails contrast on the orange, so its icon is navy.
  accent: 'bg-accent text-primary-900',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
};

/** A single headline number. Links to the page behind it when `href` is set. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone = 'primary',
  href,
  loading = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** One short line of context under the number. */
  note?: ReactNode;
  tone?: MetricTone;
  href?: string;
  loading?: boolean;
}) {
  const card = (
    <Card className="h-full gap-3 p-4 sm:p-5 transition-shadow group-hover:shadow-card-hover">
      <div className="flex items-center gap-2.5">
        <span className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="flex-1 min-w-0 text-xs sm:text-sm text-muted-foreground">{label}</p>
        {href && (
          <ArrowUpRight className="hidden xs:block size-4 text-text-faint shrink-0 transition-colors group-hover:text-primary-700" aria-hidden />
        )}
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <>
            <p className="text-2xl sm:text-3xl font-bold text-primary-900 tabular-nums leading-tight">{value}</p>
            {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
          </>
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
