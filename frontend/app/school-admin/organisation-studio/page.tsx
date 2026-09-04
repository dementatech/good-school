'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader } from '@/components/ui/loader';
import { fetchList } from '@/lib/api/envelope';
import { DepartmentsPanel } from '@/components/admin/organization/DepartmentsPanel';
import { DepartmentPositionsTabs } from '@/components/admin/organization/DepartmentPositionsTabs';
import type { Department, DepartmentCatalogEntry, Position } from '@/components/admin/organization/types';

// docs/design/departments-module.md + organization-studio.md — the school's
// department/position setup and the literal org chart it generates.
export default function OrganisationStudioPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalog, setCatalog] = useState<DepartmentCatalogEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [d, c, p] = await Promise.all([
      fetchList<Department>('/api/v1/organization/departments'),
      fetchList<DepartmentCatalogEntry>('/api/v1/organization/department-catalog'),
      fetchList<Position>('/api/v1/organization/positions'),
    ]);
    setDepartments(d);
    setCatalog(c);
    setPositions(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Organisation Studio</h1>
        <p className="text-sm text-text-muted">
          Departments — academic ones auto-generate as you offer subjects, non-academic ones you toggle
          on — and the reporting structure they sit in, from Head Teacher down to individual staff.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-primary-900">Departments</h2>
        <DepartmentsPanel departments={departments} catalog={catalog} positions={positions} onChanged={load} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-primary-900">Org chart</h2>
        <p className="text-xs text-text-muted -mt-1">
          One table per department — including Leadership, for the positions that don&rsquo;t belong to
          any department.
        </p>
        <DepartmentPositionsTabs positions={positions} departments={departments} onChanged={load} />
      </div>
    </div>
  );
}
