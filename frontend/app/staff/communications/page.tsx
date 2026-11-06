'use client';

import { Suspense } from 'react';
import { ChatApp } from '@/components/chat/ChatApp';

export default function CommunicationsPage() {
  return (
    <Suspense fallback={null}>
      <ChatApp />
    </Suspense>
  );
}
