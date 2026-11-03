import type { ReactNode } from 'react';
import { DashboardGreeting } from './DashboardGreeting';

/**
 * The page frame shared by every portal's dashboard. The desktop greeting sits
 * in PortalShell's top bar; a phone has no room there, so it goes here.
 */
export function DashboardPage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-[1440px] mx-auto">
      {title ? (
        <h1 className="text-xl font-semibold text-primary-900 mb-3 sm:mb-4">{title}</h1>
      ) : (
        <DashboardGreeting className="md:hidden mb-3" />
      )}
      {children}
    </div>
  );
}

/** Two equal columns on a wide screen, one on anything smaller. */
export function DashboardColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
      <div className="space-y-3 sm:space-y-4 min-w-0">{left}</div>
      <div className="space-y-3 sm:space-y-4 min-w-0">{right}</div>
    </div>
  );
}
