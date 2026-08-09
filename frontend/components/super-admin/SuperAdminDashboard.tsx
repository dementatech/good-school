"use client";

import { useEffect, useState } from "react";
import { Building2Icon, UsersIcon } from "lucide-react";
import { listSchools } from "@/lib/api/schools";
import { StatCard } from "@/components/dashboard/stat-card";

interface Stats {
  schools: number;
  users: number;
}

export function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    listSchools()
      .then((schools) => {
        setStats({
          schools: schools.length,
          users: schools.reduce((sum, s) => sum + s.userCount, 0),
        });
      })
      .catch(() => {
        /* stat cards just stay in their loading state on failure */
      });
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label="Total schools" value={stats?.schools ?? null} icon={Building2Icon} />
      <StatCard label="Total users" value={stats?.users ?? null} icon={UsersIcon} />
    </div>
  );
}
