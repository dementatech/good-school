'use client';

// Fixed at 2 → 4 columns on purpose — no `cols` prop. Pages with 5-6 tiles
// simply wrap to a second row; that's normal grid behaviour, not a case for
// a per-page column count (which is exactly what let column counts drift
// across dashboards before this component existed).
export function DashboardGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 ${className}`}>
      {children}
    </div>
  );
}
