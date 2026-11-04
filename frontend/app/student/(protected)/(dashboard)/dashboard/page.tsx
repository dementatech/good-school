'use client';

import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LearnerResultsDashboard } from '@/components/dashboard/LearnerResultsDashboard';

export default function StudentDashboardPage() {
  return (
    <DashboardPage>
      <LearnerResultsDashboard
        listUrl="/api/v1/exams/me"
        detailUrl={(examId) => `/api/v1/exams/me/${examId}`}
        resultsHref={(examId) => (examId ? `/student/results/${examId}` : '/student/results')}
        sidePanel={<ComingUpPanel href="/student/calendar" />}
      />
    </DashboardPage>
  );
}
