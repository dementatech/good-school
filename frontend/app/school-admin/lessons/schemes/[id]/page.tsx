'use client';

import { useParams } from 'next/navigation';
import { usePortalBase } from '@/lib/portal';
import { SchemeView } from '@/components/lesson-prep/SchemeView';

export default function AdminSchemePage() {
  const { id } = useParams<{ id: string }>();
  const base = usePortalBase();
  return <SchemeView schemeId={id} mode="admin" backHref={`${base}/lessons`} />;
}
