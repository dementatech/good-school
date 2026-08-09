"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, GraduationCapIcon, LayersIcon, UsersIcon } from "lucide-react";
import { listStudents } from "@/lib/api/students";
import { listClasses } from "@/lib/api/classes";
import { listStreams } from "@/lib/api/streams";
import { listAcademicYears } from "@/lib/api/academicYears";
import { listTerms } from "@/lib/api/terms";
import { StatCard } from "@/components/dashboard/stat-card";

interface Stats {
  activeStudents: number;
  classes: number;
  streams: number;
  currentPeriod: string;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([listStudents(), listClasses(), listStreams(), listAcademicYears(), listTerms()])
      .then(([students, classes, streams, years, terms]) => {
        const currentYear = years.find((y) => y.isCurrent);
        const currentTerm = terms.find((t) => t.isCurrent);
        const currentPeriod = currentYear
          ? currentTerm
            ? `${currentTerm.name}, ${currentYear.yearName}`
            : currentYear.yearName
          : "Not set";

        setStats({
          activeStudents: students.filter((s) => s.isActive).length,
          classes: classes.length,
          streams: streams.length,
          currentPeriod,
        });
      })
      .catch(() => {
        /* stat cards just stay in their loading state on failure */
      });
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Active students" value={stats?.activeStudents ?? null} icon={UsersIcon} />
      <StatCard label="Classes" value={stats?.classes ?? null} icon={GraduationCapIcon} />
      <StatCard label="Streams" value={stats?.streams ?? null} icon={LayersIcon} />
      <StatCard label="Current term" value={stats?.currentPeriod ?? null} icon={CalendarIcon} />
    </div>
  );
}
