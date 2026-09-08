'use client';

import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { UserAccountsTab } from '@/components/admin/accounts/UserAccountsTab';
import { ParentsTab } from '@/components/admin/accounts/ParentsTab';
import type { AccountSummary, AccountTab } from '@/components/admin/accounts/types';

const TABS: { key: AccountTab; label: string; countKey: keyof AccountSummary }[] = [
  { key: 'school-admins', label: 'School Admins', countKey: 'schoolAdmins' },
  { key: 'staff', label: 'Staff', countKey: 'staff' },
  { key: 'students', label: 'Students', countKey: 'students' },
  { key: 'parents', label: 'Parents', countKey: 'parents' },
  { key: 'super-admins', label: 'Super Admins', countKey: 'superAdmins' },
];

const STORAGE_KEY = 'accounts-active-tab';

export default function AccountsPage() {
  const [active, setActive] = useState<AccountTab>('school-admins');
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  // Restore the last-viewed tab after mount — kept out of the initializer so
  // server and first client render always agree (same localStorage-hydrate
  // pattern as PortalSidebar).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydrate, same as PortalSidebar
      if (saved && TABS.some((t) => t.key === saved)) setActive(saved as AccountTab);
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/admin/accounts/summary', { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        if (json.success) setSummary(json.data as AccountSummary);
      } catch {
        /* counts are cosmetic — leave them undefined */
      }
    })();
  }, []);

  function selectTab(key: string) {
    setActive(key as AccountTab);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Accounts</h1>
        <p className="text-sm text-text-muted">
          Every sign-in across the platform. Reset passwords, deactivate access and fix contact
          details here — people and their roles are created in the rosters and school onboarding.
        </p>
      </div>

      <Tabs
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: summary ? summary[t.countKey] : undefined,
        }))}
        active={active}
        onChange={selectTab}
      />

      {active === 'parents' ? <ParentsTab /> : <UserAccountsTab key={active} type={active} />}
    </div>
  );
}
