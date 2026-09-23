'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Printer } from 'lucide-react';
import Link from 'next/link';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { RATINGS, RATING_LABEL, RATING_MEANING, type AssessmentSheet, type SheetPupil } from './types';

interface SchoolInfo {
  name: string;
  district: string | null;
  address: string | null;
  logoUrl: string | null;
  headTeacherName: string | null;
  emisCodes?: Partial<Record<string, string>>;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
}

function ageOn(dateOfBirth: string | null, on: string): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const at = new Date(on);
  let years = at.getFullYear() - dob.getFullYear();
  let months = at.getMonth() - dob.getMonth();
  if (at.getDate() < dob.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} yr${years === 1 ? '' : 's'}${months ? ` ${months} mo` : ''}`;
}

function ProgressReportSheet({
  pupil,
  sheet,
  school,
}: {
  pupil: SheetPupil;
  sheet: AssessmentSheet;
  school: SchoolInfo | null;
}) {
  const schoolName = school?.name ?? 'School';
  const subtitle = [school?.address, school?.district].filter(Boolean).join(', ');
  const age = ageOn(pupil.dateOfBirth, sheet.term.endDate);

  return (
    <div className="report-sheet bg-white p-2 max-w-[800px] mx-auto">
      <div className="border-4 border-primary-700 p-1">
        <div className="border border-primary-700 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-12 h-12 rounded-full border-2 border-primary-700 flex items-center justify-center overflow-hidden shrink-0 bg-primary-50">
              {school?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={school.logoUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-primary-700 font-extrabold text-sm">{initialsOf(schoolName)}</span>
              )}
            </div>
            <div className="flex-1 text-center">
              <p className="text-xl font-extrabold text-primary-700 uppercase tracking-wide leading-tight">{schoolName}</p>
              {subtitle && (
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{subtitle}</p>
              )}
              {school?.emisCodes?.KINDERGARTEN && (
                <p className="text-[10px] font-semibold text-text-muted tracking-wide">
                  EMIS No. {school.emisCodes.KINDERGARTEN}
                </p>
              )}
              <p className="text-[11px] font-bold text-primary-700 uppercase tracking-wide mt-1">
                {sheet.class.name} &middot; {sheet.term.name}
              </p>
              <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white bg-gradient-to-r from-accent-dark to-accent">
                Progress Report
              </span>
            </div>
            <div className="w-12 h-14 border border-border shrink-0 overflow-hidden">
              {pupil.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pupil.photoUrl} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm mb-3 border-t border-b border-border py-1.5">
            <p className="flex items-baseline gap-2">
              <span className="text-text-muted shrink-0">Pupil&apos;s Name:</span>
              <span className="flex-1 border-b border-dotted border-border-strong font-semibold text-primary-900 pb-0.5">
                {pupil.name}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Class:</span>
                <span className="font-semibold text-primary-900">
                  {sheet.class.name}
                  {pupil.streamName ? ` ${pupil.streamName}` : ''}
                </span>
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Pupil ID:</span>
                <span className="font-semibold text-primary-900">{pupil.systemId ?? '—'}</span>
              </p>
              {age && (
                <p className="flex items-baseline gap-2">
                  <span className="text-text-muted">Age:</span>
                  <span className="font-semibold text-primary-900">{age}</span>
                </p>
              )}
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Class Teacher:</span>
                <span className="font-semibold text-primary-900">{sheet.class.classTeacherName ?? '—'}</span>
              </p>
            </div>
          </div>

          <table className="w-full text-sm border border-border">
            <thead>
              <tr className="bg-bg-subtle text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
                <th className="py-1 px-2 border-b border-r border-border text-left">Learning Area</th>
                {RATINGS.map((r) => (
                  <th key={r} className="py-1 px-2 border-b border-r border-border text-center w-20">
                    {RATING_LABEL[r]}
                  </th>
                ))}
                <th className="py-1 px-2 border-b border-border text-left">Teacher&apos;s Note</th>
              </tr>
            </thead>
            <tbody>
              {sheet.learningAreas.map((a) => {
                const entry = pupil.ratings[a.id];
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 px-2 border-r border-border">
                      <span className="font-medium text-primary-900">{a.name}</span>
                      {a.description && <span className="block text-[10px] text-text-faint">{a.description}</span>}
                    </td>
                    {RATINGS.map((r) => (
                      <td key={r} className="py-1.5 px-2 border-r border-border text-center">
                        {entry?.rating === r && <Check className="w-4 h-4 mx-auto text-primary-700" aria-label={RATING_LABEL[r]} />}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-xs text-text-secondary">{entry?.comment ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 space-y-2">
            <div className="border border-border p-2 min-h-[3rem]">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-faint mb-0.5">Class Teacher&apos;s Remark</p>
              <p className="text-xs text-text-secondary italic">{pupil.classTeacherComment ?? ''}</p>
            </div>
            <div className="border border-border p-2 min-h-[3rem]">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-faint mb-0.5">Head Teacher&apos;s Remark</p>
              <p className="text-xs text-text-secondary italic">{pupil.headTeacherComment ?? ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mt-5 text-xs text-text-muted text-center">
            <div>
              <div className="h-5 border-b border-border mb-1" />
              Class Teacher&apos;s Signature
            </div>
            <div>
              <div className="h-5 border-b border-border mb-1" />
              Parent/Guardian&apos;s Signature
            </div>
            <div>
              <div className="h-5 border-b border-border mb-1" />
              {school?.headTeacherName ? `${school.headTeacherName} — Head Teacher` : 'Head Teacher’s Signature'}
            </div>
          </div>

          <div className="mt-3 pt-1.5 border-t border-border text-[9px] leading-tight text-text-secondary space-y-0.5">
            {RATINGS.map((r) => (
              <p key={r}>
                <span className="font-semibold text-text-muted">{RATING_LABEL[r]}:</span> {RATING_MEANING[r]}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Printable kindergarten progress reports — one A4 page per pupil. */
export function KindergartenReport({ portal }: { portal: 'school-admin' | 'staff' }) {
  const search = useSearchParams();
  const toast = useToast();
  const classId = search.get('classId') ?? '';
  const termId = search.get('termId') ?? '';
  const studentId = search.get('studentId');
  const [sheet, setSheet] = useState<AssessmentSheet | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const qs = new URLSearchParams({ classId, termId });
      if (studentId) qs.set('studentUserId', studentId);
      const [s, sch] = await Promise.all([
        fetchOne<AssessmentSheet>(`/api/v1/early-years/sheet?${qs.toString()}`, toast.error),
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
      ]);
      setSheet(s);
      setSchool(sch);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, termId, studentId]);

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg-card px-6 py-3">
        <Link href={`/${portal}/kindergarten`} className="text-sm text-primary-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to Kindergarten Progress
        </Link>
        {!loading && sheet && sheet.pupils.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden /> Print
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      ) : !sheet || sheet.pupils.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-16">No pupils to report on.</p>
      ) : (
        <div className="py-4 print:py-0 space-y-6 print:space-y-0">
          {sheet.pupils.map((p) => (
            <ProgressReportSheet key={p.studentUserId} pupil={p} sheet={sheet} school={school} />
          ))}
        </div>
      )}
    </div>
  );
}
