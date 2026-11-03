import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export function MetricTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-card bg-white border border-border shadow-card p-4 sm:p-5 transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm text-text-muted">{label}</p>
        <ArrowUpRight className="w-4 h-4 text-text-faint shrink-0 transition-colors group-hover:text-primary-600" aria-hidden />
      </div>
      <div className="flex items-center gap-2.5 mt-3">
        <span className="hidden xs:flex w-8 h-8 rounded-full border border-border text-text-secondary items-center justify-center shrink-0">
          <Icon className="w-4 h-4" aria-hidden />
        </span>
        <p className="text-2xl font-bold text-primary-900 tabular-nums">{value}</p>
      </div>
    </Link>
  );
}
