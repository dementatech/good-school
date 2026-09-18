'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  href?: string;
  /** Present → numeric "stat tile" mode. Absent → "nav tile" mode (label + description only). */
  value?: React.ReactNode;
  /** Nav-tile mode secondary copy. Ignored if `value` is set. */
  description?: string;
  /** Rendered beside the label in stat-tile mode, e.g. a <Sparkline />. */
  trailing?: React.ReactNode;
  /** Card tone. 'hero' is the one bold, solid-fill tile per row. */
  accent?: 'neutral' | 'gold' | 'hero';
  loading?: boolean;
  className?: string;
}

const ACCENT = {
  neutral: { card: '', mark: 'text-primary-900/[0.06]', label: 'text-text-muted', value: 'text-primary-900' },
  gold: { card: '', mark: 'text-accent-dark/10', label: 'text-text-muted', value: 'text-primary-900' },
  hero: { card: '!bg-primary-700 !border-primary-700', mark: 'text-white/10', label: 'text-primary-100', value: 'text-white' },
} satisfies Record<string, { card: string; mark: string; label: string; value: string }>;

export function StatCard({
  icon: Icon,
  label,
  href,
  value,
  description,
  trailing,
  accent = 'neutral',
  loading = false,
  className = '',
}: StatCardProps) {
  const s = ACCENT[accent];

  const inner = (
    <Card hover={!!href} className={`relative h-full overflow-hidden ${s.card} ${className}`}>
      {/* Depth mark, not an icon "block" — the entity icon as a faint
          oversized watermark bleeding off the card's right edge. */}
      <Icon className={`absolute -right-4 -top-4 w-24 h-24 pointer-events-none ${s.mark}`} aria-hidden />

      <div className="relative">
        {value !== undefined ? (
          <>
            <p className={`text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums ${s.value}`}>
              {loading ? '—' : value}
            </p>
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 mt-1.5">
              <p className={`text-sm ${s.label}`}>{label}</p>
              {trailing && <div className="shrink-0">{trailing}</div>}
            </div>
          </>
        ) : (
          <>
            <p className={`font-semibold ${accent === 'hero' ? 'text-white' : 'text-primary-900'}`}>{label}</p>
            {description && <p className={`text-sm mt-1 ${s.label}`}>{description}</p>}
          </>
        )}
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
