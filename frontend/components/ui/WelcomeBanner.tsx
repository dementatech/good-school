'use client';

import { Sparkles } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeBanner({ subtitle, className = '' }: { subtitle: string; className?: string }) {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0];

  return (
    <div className={`relative overflow-hidden rounded-card bg-primary-700 text-white p-5 sm:p-6 mb-4 sm:mb-6 ${className}`}>
      <Sparkles className="absolute -right-4 -top-4 w-28 h-28 text-white/10" aria-hidden />
      <p className="text-lg sm:text-xl font-bold relative">
        {greeting()}{firstName ? `, ${firstName}` : ''}!
      </p>
      <p className="text-sm text-primary-100 mt-1 relative">{subtitle}</p>
    </div>
  );
}
