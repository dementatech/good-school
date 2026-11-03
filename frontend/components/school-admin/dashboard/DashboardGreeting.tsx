'use client';

import { useAuth } from '@/components/auth/AuthContext';

export function DashboardGreeting({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  // An account with no name on file gets its system ID or email as `name`, which is
  // no way to greet someone.
  const hasRealName = !!user?.name && user.name !== user.staffId && user.name !== user.email;
  const firstName = hasRealName ? user.name.trim().split(/\s+/)[0] : null;
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-lg font-semibold text-primary-900 truncate">Hey, {firstName || 'there'}</p>
      <p className="text-xs text-text-muted">{date}</p>
    </div>
  );
}
