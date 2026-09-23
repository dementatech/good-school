'use client';

import { useParams } from 'next/navigation';
import { PlanView } from '@/components/lesson-prep/PlanView';

export default function AdminPlanPage() {
  const { id } = useParams<{ id: string }>();
  return <PlanView planId={id} mode="admin" backHref="/school-admin/lessons" />;
}
