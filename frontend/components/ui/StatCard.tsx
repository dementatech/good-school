'use client';

import type { LucideIcon } from 'lucide-react';
import { MetricCard, ShortcutCard } from '@/components/dashboard/MetricCard';

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  href?: string;
  /** Present: a headline number. Absent: a labelled tile using `description`. */
  value?: React.ReactNode;
  description?: string;
  loading?: boolean;
}

/** The older name for the kit's cards, kept for pages that aren't dashboards. */
export function StatCard({ icon, label, href, value, description, loading = false }: StatCardProps) {
  return value !== undefined ? (
    <MetricCard icon={icon} label={label} href={href} value={value} loading={loading} />
  ) : (
    <ShortcutCard icon={icon} label={label} href={href} description={description} />
  );
}
