'use client';

import { UsersRound } from 'lucide-react';
import { Badge } from '@/components/kit/badge';
import { Card } from '@/components/kit/card';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LearnerResultsDashboard } from '@/components/dashboard/LearnerResultsDashboard';
import { Panel } from '@/components/dashboard/Panel';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';

export default function ParentDashboardPage() {
  const { children, loading, selectedId } = useParentChildren();
  const selected = children.find((child) => child.id === selectedId);

  return (
    <DashboardPage>
      {loading && <Panel icon={UsersRound} title="Your children" loading />}

      {!loading && children.length === 0 && (
        <Panel
          icon={UsersRound}
          title="Your children"
          empty="No children are linked to your account yet. Contact your school or Good School administrator."
        />
      )}

      {selected && (
        <>
          <Card className="flex-row items-center justify-between gap-3 p-4 sm:px-5 mb-3 sm:mb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Viewing</p>
              <p className="text-sm font-semibold text-primary-900 truncate">{selected.name}</p>
            </div>
            {selected.className && <Badge variant="secondary">{selected.className}</Badge>}
          </Card>
          <LearnerResultsDashboard
            key={selected.id}
            listUrl={`/api/v1/parent/results?studentId=${selected.id}`}
            detailUrl={(examId) => `/api/v1/parent/results/${examId}?studentId=${selected.id}`}
            resultsHref={(examId) => (examId ? `/parent/results/${examId}?child=${selected.id}` : '/parent/results')}
          />
        </>
      )}
    </DashboardPage>
  );
}
