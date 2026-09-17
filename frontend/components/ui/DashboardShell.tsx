'use client';

import { DashboardRightRail } from './DashboardRightRail';

// The shared page-level wrapper for all 7 role dashboards: main content plus
// the profile/calendar/reminders right rail, stacking below xl. Deliberately
// page-level (not in the role layout.tsx shells) — the rail belongs on the
// dashboard landing page, not on every route under that role.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[1440px] mx-auto">
      <div className="flex flex-col xl:flex-row gap-4 sm:gap-5 lg:gap-6 items-start">
        <div className="flex-1 min-w-0">{children}</div>
        <DashboardRightRail />
      </div>
    </div>
  );
}
