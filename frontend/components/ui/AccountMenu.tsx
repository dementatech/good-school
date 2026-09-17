'use client';

import { useRouter } from 'next/navigation';
import { UserCircle, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Staff',
  staff: 'Staff',
  school_admin: 'School Admin',
  admin: 'Super Admin',
  super_admin: 'Super Admin',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AccountMenu({ accountHref, onSignOut }: { accountHref?: string; onSignOut: () => void }) {
  const router = useRouter();
  const { user } = useAuth();

  const items: DropdownMenuItem[] = [];
  if (accountHref) {
    items.push({ label: 'My Account', icon: UserCircle, onClick: () => router.push(accountHref) });
  }
  items.push({ label: 'Sign out', icon: LogOut, danger: true, separatorBefore: !!accountHref, onClick: onSignOut });

  return (
    <DropdownMenu
      label="Account"
      items={items}
      trigger={
        <span className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border hover:bg-bg-muted transition-colors">
          <span className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
            {user ? initials(user.name) : '—'}
          </span>
          {user && (
            <span className="hidden lg:block text-left leading-tight">
              <span className="block text-sm font-semibold text-primary-900">{user.name}</span>
              <span className="block text-xs text-text-muted">{ROLE_LABELS[user.role] ?? user.role}</span>
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden />
        </span>
      }
    />
  );
}
