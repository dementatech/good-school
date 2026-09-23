'use client';

import { useParams } from 'next/navigation';
import { SchemeView } from '@/components/lesson-prep/SchemeView';

export default function AdminSchemePage() {
  const { id } = useParams<{ id: string }>();
  return <SchemeView schemeId={id} mode="admin" backHref="/school-admin/lessons" />;
}
