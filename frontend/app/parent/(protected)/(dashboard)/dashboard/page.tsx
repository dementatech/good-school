'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { TopPerformersCard } from '@/components/ui/TopPerformersCard';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';
import { Award, ClipboardCheck, BookOpen, Bell } from 'lucide-react';

interface TopPerformersResult {
  topPerformers: { studentId: string; studentName: string; rank: number }[];
  isFeatured: boolean;
  message: string | null;
}

const TILES = [
  { href: '/parent/results', label: 'Results', description: "See your child's assessment results.", icon: Award },
  { href: '/parent/attendance', label: 'Attendance', description: "See your child's attendance history.", icon: ClipboardCheck },
  { href: '/parent/lessons', label: 'Lessons', description: 'See topics covered in class.', icon: BookOpen },
  { href: '/parent/notifications', label: 'Notifications', description: 'Announcements and updates.', icon: Bell },
];

export default function ParentDashboardPage() {
  const { children, loading, selectedId } = useParentChildren();
  const selected = children.find((c) => c.id === selectedId);

  const [topPerformers, setTopPerformers] = useState<TopPerformersResult | null>(null);
  const [topPerformersLoading, setTopPerformersLoading] = useState(false);

  const loadTopPerformers = useCallback(async (studentId: string) => {
    setTopPerformersLoading(true);
    try {
      const res = await fetch(`/api/v1/parent/performance?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) setTopPerformers(data.data);
    } finally {
      setTopPerformersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadTopPerformers(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, loadTopPerformers]);

  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Your children's assessments, attendance and lessons." />

      {!loading && children.length === 0 && (
        <Card className="p-5 mb-6">
          <p className="text-sm text-text-muted">
            No children are linked to your account yet. Contact your school or Good School administrator.
          </p>
        </Card>
      )}

      {selected && (
        <Card className="p-5 mb-6">
          <p className="text-xs font-medium text-[#666666] tracking-wide mb-1">VIEWING</p>
          <p className="font-semibold text-primary-900 flex items-center gap-2">
            {selected.name}
            {selected.className && <Badge variant="muted">{selected.className}</Badge>}
          </p>
        </Card>
      )}

      {selectedId && (
        <div className="mb-6">
          <TopPerformersCard data={topPerformers} loading={topPerformersLoading} />
        </div>
      )}

      <DashboardGrid>
        {TILES.map((t, i) => (
          <StatCard
            key={t.href}
            icon={t.icon}
            label={t.label}
            description={t.description}
            href={t.href}
            accent={i === 0 ? 'hero' : 'neutral'}
          />
        ))}
      </DashboardGrid>
    </DashboardShell>
  );
}
