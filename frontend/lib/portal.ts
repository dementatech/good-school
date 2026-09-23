'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Which portal an admin-area page is being shown in. The Director of Studies'
 * portal (/dos) reuses the school admin's academic pages, so their links must
 * stay inside whichever portal they were opened from.
 */
export function usePortalBase(): '/dos' | '/school-admin' {
  const pathname = usePathname();
  return pathname?.startsWith('/dos') ? '/dos' : '/school-admin';
}

export interface DosStatus {
  isDos: boolean;
  positionTitle: string | null;
}

/**
 * Whether the signed-in teacher is the school's Director of Studies (holds the
 * academic head's position this year). null while loading.
 */
export function useDirectorOfStudies(): DosStatus | null {
  const [dos, setDos] = useState<DosStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/v1/auth/dos', { credentials: 'include' }).catch(() => null);
      const body: DosStatus = (await res?.json().catch(() => null)) ?? { isDos: false, positionTitle: null };
      if (!cancelled) setDos({ isDos: !!body.isDos, positionTitle: body.positionTitle ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return dos;
}
