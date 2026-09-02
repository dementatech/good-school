'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { STATUS_LABEL, STATUS_VARIANT, type School } from '@/components/admin/schools/types';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#FAFAFA] py-1.5 last:border-0">
      <dt className="text-[#666666]">{label}</dt>
      <dd className="text-[#12333F] text-right min-w-0 break-words">{value || '—'}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-text-faint mb-1">{title}</p>
      <dl className="grid grid-cols-1 gap-y-1 text-sm">{children}</dl>
    </div>
  );
}

export default function SchoolAdminSchoolPage() {
  const toast = useToast();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/v1/schools/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (data.success) setSchool(data.data);
        else toast.error(data.error ?? 'Failed to load your school.');
      } catch {
        if (!controller.signal.aborted) toast.error('Network error while loading your school.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cap = (v: string | null) => (v ? v[0].toUpperCase() + v.slice(1) : null);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">My School</h1>
        <p className="text-sm text-text-muted">
          Read-only — changes to your school&apos;s record are made by a Good School administrator.
        </p>
      </div>

      <Card>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader size={36} />
          </div>
        ) : !school ? (
          <p className="text-sm text-text-muted">Could not load your school.</p>
        ) : (
          <div className="space-y-5">
            <p className="font-semibold text-primary-900 text-lg flex flex-wrap items-center gap-2">
              {school.name}
              <Badge variant={STATUS_VARIANT[school.onboardingStatus]}>
                {STATUS_LABEL[school.onboardingStatus]}
              </Badge>
            </p>

            <Group title="Identity">
              <Row label="Legal / registered name" value={school.legalName} />
              <Row label="Slug" value={school.slug} />
            </Group>

            <Group title="Regulatory">
              <Row label="EMIS code" value={school.emisCode} />
              <Row label="UNEB centre number" value={school.unebCentreNumber} />
              <Row label="Ownership" value={cap(school.ownershipType)} />
              <Row label="Registration status" value={cap(school.registrationStatus)} />
            </Group>

            <Group title="Location">
              <Row label="District" value={school.district} />
              <Row label="Sub-county / division" value={school.subCounty} />
              <Row label="Address" value={school.address} />
            </Group>

            <Group title="Leadership & contact">
              <Row label="Head Teacher / Director" value={school.headTeacherName} />
              <Row label="Head Teacher contact" value={school.headTeacherContact} />
              <Row label="Phone" value={school.phone} />
              <Row label="Email" value={school.email} />
              <Row label="Website" value={school.website} />
            </Group>

            <Group title="Profile">
              <Row label="School type" value={cap(school.schoolType)} />
              <Row label="Gender composition" value={cap(school.genderComposition)} />
              <Row
                label="Levels offered"
                value={[school.offersOLevel && 'O-Level', school.offersALevel && 'A-Level']
                  .filter(Boolean)
                  .join(', ')}
              />
              <Row
                label="Curricula"
                value={school.curricula
                  .map((c) => `${c.code}${c.isPrimary ? ' (primary)' : ''}`)
                  .join(', ')}
              />
            </Group>
          </div>
        )}
      </Card>
    </div>
  );
}
