'use client';

import { useParams } from 'next/navigation';
import { ReportDesigner } from '@/components/admin/report-cards/designer/ReportDesigner';

// The Report Designer for one of the school's own report card templates —
// full screen, over the portal's chrome. Opened from Report Card Templates.
export default function ReportDesignerPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportDesigner templateId={id} />;
}
