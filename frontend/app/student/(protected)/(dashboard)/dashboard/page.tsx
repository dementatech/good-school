'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { TopPerformersCard } from '@/components/ui/TopPerformersCard';
import { ClassLessonFeed } from '@/components/ui/ClassLessonFeed';
import { PromoCarousel } from '@/components/ui/PromoCarousel';
import { Award, ClipboardList, Library } from 'lucide-react';

const TILES = [
  { href: '/student/list', label: 'My Assessments', description: 'See what’s open to sit and start one.', icon: ClipboardList },
  { href: '/student/results', label: 'My Results', description: 'See every assessment you’ve attempted and its score.', icon: Award },
  // The Library has always been reachable from the sidebar, but that sidebar is
  // behind a drawer on a phone — which is how most of these learners arrive.
  // A tile here is the cheap half of the discovery problem; the carousel above
  // is the other half.
  { href: '/student/library', label: 'Library', description: 'Practice papers, videos and reading for free time.', icon: Library },
];

interface PromoSlide {
  id: string;
  kind: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}

interface TopPerformersResult {
  topPerformers: { studentId: string; studentName: string; rank: number }[];
  isFeatured: boolean;
  message: string | null;
}

export default function StudentDashboardPage() {
  const [topPerformers, setTopPerformers] = useState<TopPerformersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState<PromoSlide[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/v1/student/performance');
        const data = await res.json();
        if (!controller.signal.aborted && data.success) setTopPerformers(data.data);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Fetched separately so the strip never delays the rest of the dashboard, and
  // a failure here costs the learner nothing — the carousel simply does not
  // appear. It is a suggestion, not information they came for.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/student/promos', { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (!controller.signal.aborted && res.success) setPromos(res.data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Your assessments, all in one place." />

      {/*
        Above the leaderboard on purpose. This is the only thing on the learner's
        dashboard that points at something they have not already come here to do,
        and below the fold it may as well not exist.
      */}
      {promos.length > 0 && (
        <div className="mb-6">
          <PromoCarousel slides={promos} />
        </div>
      )}

      <div className="mb-6">
        <TopPerformersCard data={topPerformers} loading={loading} />
      </div>

      <div className="mb-6">
        <ClassLessonFeed />
      </div>

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
