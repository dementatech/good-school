'use client';

import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { switchSection, useSchoolLevelsState } from '@/lib/levels';

/**
 * Kindergarten pages exist only for schools that run Kindergarten — for any
 * other school they're an ordinary 404, never a glimpse of the feature. A
 * school admin who has a Nursery section but is working in another one is
 * offered the switch instead.
 */
export function KindergartenGate({ children, scoped = true }: { children: React.ReactNode; scoped?: boolean }) {
  // School admin: only while in the Nursery section. Teacher: any school with a Nursery.
  const { loaded, flags } = useSchoolLevelsState({ scoped });
  const { flags: all } = useSchoolLevelsState({ scoped: false });
  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }
  if (flags?.offersKindergarten) return <>{children}</>;
  if (!all?.offersKindergarten) notFound();
  return (
    <Card className="max-w-md mx-auto mt-12 text-center space-y-3">
      <p className="text-sm text-text-muted">This page belongs to your Nursery section.</p>
      <Button inline onClick={() => switchSection('KINDERGARTEN')}>
        Switch to Nursery
      </Button>
    </Card>
  );
}
