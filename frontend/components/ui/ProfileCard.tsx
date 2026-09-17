'use client';

import { useAuth } from '@/components/auth/AuthContext';
import { Card } from './Card';

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Staff',
  staff: 'Staff',
  school_admin: 'School Admin',
  admin: 'Super Admin',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function ProfileCard({ className = '' }: { className?: string }) {
  const { user, loading } = useAuth();

  return (
    <Card className={`text-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold mx-auto mb-3">
        {user ? initials(user.name) : '—'}
      </div>
      <p className="font-semibold text-primary-900">{loading ? 'Loading…' : (user?.name ?? 'Signed out')}</p>
      <p className="text-sm text-text-muted">{user ? (ROLE_LABELS[user.role] ?? user.role) : ''}</p>
    </Card>
  );
}
