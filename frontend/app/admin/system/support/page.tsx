'use client';

import { Suspense } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { SupportInbox } from '@/components/support/SupportInbox';

// The system layout already limits this to super_admin; the inbox is further
// limited to the platform owner and support agents (enforced server-side too —
// /support/inbox).
export default function SupportInboxPage() {
  const { user } = useAuth();
  if (!user?.isPlatformOwner && !user?.isSupportAgent) {
    return (
      <Card>
        <p className="text-sm text-text-muted">The support inbox is only available to the platform owner and support agents.</p>
      </Card>
    );
  }
  return (
    <Suspense fallback={null}>
      <SupportInbox />
    </Suspense>
  );
}
