'use client';

import { useParams } from 'next/navigation';
import { SchemeView } from '@/components/lesson-prep/SchemeView';

export default function StaffSchemePage() {
  const { id } = useParams<{ id: string }>();
  return <SchemeView schemeId={id} mode="teacher" backHref="/staff/lessons" />;
}
