'use client';

import { useParams } from 'next/navigation';
import { usePortalBase } from '@/lib/portal';
import { PlanView } from '@/components/lesson-prep/PlanView';

export default function AdminPlanPage() {
  const { id } = useParams<{ id: string }>();
  const base = usePortalBase();
  return <PlanView planId={id} mode="admin" backHref={`${base}/lessons`} />;
}
