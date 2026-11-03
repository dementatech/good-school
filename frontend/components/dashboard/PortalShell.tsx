'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { FeatureGate } from '@/components/FeatureGate';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { MobileNavDrawer, type NavItem } from '@/components/ui/MobileNavDrawer';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import { SectionSwitcher } from '@/components/ui/SectionSwitcher';
import { TopbarSearch } from '@/components/ui/TopbarSearch';
import { DashboardGreeting } from './DashboardGreeting';

export interface PortalShellProps {
  children: ReactNode;
  nav: NavItem[];
  /** The portal's landing page: the desktop top bar greets the user there. */
  dashboardHref: string;
  /** Second sidebar group, e.g. the super admin's System pages. */
  secondaryNav?: { label: string; items: NavItem[] };
  /** Under the school name in the sidebar and drawer. Defaults to the user's name. */
  subtitle?: string;
  accountHref?: string;
  /** Pinned to the foot of the mobile drawer. */
  footerItems?: NavItem[];
  /** For schools running several sections, e.g. Nursery and Primary. */
  showSectionSwitcher?: boolean;
  /** Portal-specific control in the top bar, e.g. a parent's child picker. */
  topbarAction?: ReactNode;
}

/**
 * The frame around every portal: sidebar, top bar, mobile bar and page area.
 * Each portal supplies only its navigation, so they can't drift apart.
 */
export function PortalShell({
  children,
  nav,
  dashboardHref,
  secondaryNav,
  subtitle,
  accountHref,
  footerItems,
  showSectionSwitcher = false,
  topbarAction,
}: PortalShellProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const school = user?.school || 'Good School';
  const caption = subtitle ?? user?.name;

  const signOut = () => {
    logout();
    router.push('/auth');
  };

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white flex">
      <div className="print:!hidden contents">
        <PortalSidebar brandLogoUrl={user?.logoUrl} brandLabel={school} subtitle={caption} nav={nav} secondaryNav={secondaryNav} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex print:!hidden items-center justify-between gap-4 px-8 pt-5">
          <div className="flex items-center gap-4 min-w-0">
            {pathname === dashboardHref && <DashboardGreeting />}
            {showSectionSwitcher && <SectionSwitcher />}
          </div>
          <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
            <TopbarSearch items={[...nav, ...(secondaryNav?.items ?? [])]} fieldClassName="bg-white" />
            {topbarAction}
            <NotificationBell />
            <AccountMenu accountHref={accountHref} onSignOut={signOut} />
          </div>
        </header>

        <header className="md:hidden print:!hidden border-b border-border bg-bg-card">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <MobileNavDrawer
                title={school}
                subtitle={caption ?? undefined}
                items={nav}
                secondaryItems={secondaryNav?.items}
                secondaryLabel={secondaryNav?.label}
                footerItems={footerItems}
                onSignOut={signOut}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user?.logoUrl || '/logo.png'}
                alt=""
                className="w-8 h-8 rounded-lg object-contain bg-white border border-border shrink-0"
              />
              <p className="text-sm font-semibold text-primary-900 truncate">{school}</p>
            </div>
            <NotificationBell />
          </div>
          {topbarAction && <div className="px-4 pb-3">{topbarAction}</div>}
          {showSectionSwitcher && (
            <div className="flex justify-center px-4 pb-2 empty:hidden">
              <SectionSwitcher compact />
            </div>
          )}
        </header>

        <main className="flex-1 p-3 sm:p-6 md:px-8 md:py-5 print:p-0">
          <FeatureGate>{children}</FeatureGate>
        </main>
      </div>
    </div>
  );
}
