'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { Sparkline } from '@/components/ui/Sparkline';
import { CheckSquare, ClipboardCheck, ClipboardList, FileText, TrendingUp } from 'lucide-react';

interface Stats {
  lessons?: number;
  assessments?: number;
  toMark?: number;
}

interface TrendPoint {
  label: string;
  value: number;
}

const CARDS = [
  { key: 'lessons' as const, label: 'My Lesson Reports', href: '/staff/lessons', icon: FileText },
  { key: 'assessments' as const, label: 'My Assessments', href: '/staff/assessments', icon: ClipboardList },
  { key: 'toMark' as const, label: 'Answers To Mark', href: '/staff/marking', icon: CheckSquare },
];

export default function StaffDashboard() {
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/system/stats').then((r) => r.json());
        if (res.data) setStats(res.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      const res = await fetch('/api/v1/staff/performance?trend=1').then((r) => r.json());
      if (res.success) setTrend(res.data);
    }
    loadTrend();
  }, []);

  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Your lesson reports, papers and marking." />

      <Link href="/staff/exam-marks" className="block mb-4">
        <Card hover className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-700 shrink-0">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-primary-900">Exam Marks</p>
            <p className="text-sm text-text-muted">Enter scores for the exams and classes you teach.</p>
          </div>
        </Card>
      </Link>

      <DashboardGrid>
        {CARDS.map((c, i) => (
          <StatCard
            key={c.key}
            icon={c.icon}
            label={c.label}
            href={c.href}
            value={stats[c.key] ?? 0}
            loading={loading}
            accent={i === 0 ? 'hero' : 'neutral'}
          />
        ))}

        <StatCard
          icon={TrendingUp}
          label="Performance"
          href="/staff/performance"
          value={trend.length > 0 ? `${trend[trend.length - 1].value}%` : '—'}
          accent="gold"
          trailing={<Sparkline points={trend.map((t) => t.value)} />}
        />
      </DashboardGrid>
    </DashboardShell>
  );
}
