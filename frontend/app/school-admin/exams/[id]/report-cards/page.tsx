'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePortalBase } from '@/lib/portal';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import type { SchoolLevel } from '@/lib/levels';
import {
  StudentReportCardSheet,
  bandsFrom,
  type ExamReportCard,
  type NurseryRatings,
  type SchoolGradingSchemeSelection,
  type SchoolInfo,
  type Sheet,
} from '@/components/admin/report-cards/ReportCardSheet';

interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: SchoolLevel;
}

function ReportCardsContent() {
  const { id: examId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const base = usePortalBase();
  const { user } = useAuth();
  const toast = useToast();

  const classIdParam = search.get('classId');
  const streamIdParam = search.get('streamId');
  const studentIdParam = search.get('studentId');
  const yearIdParam = search.get('yearId');
  const wholeSchool = search.get('all') === '1';

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [gradingSchemes, setGradingSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Signals headless Chrome (backend report-card-pdf.ts) that this
  // client-rendered, fetch-driven page has actually finished loading —
  // without it, a PDF render could snapshot the page mid-fetch and come out
  // blank. Cleared on unmount so a stale "ready" flag can't leak.
  useEffect(() => {
    document.body.setAttribute('data-pdf-ready', loading ? 'false' : 'true');
    return () => {
      document.body.removeAttribute('data-pdf-ready');
    };
  }, [loading]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      const [school, schemes] = await Promise.all([
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
      ]);
      setSchoolInfo(school);
      setGradingSchemes(schemes);
      const nurseryStyle =
        school?.sectionSettings?.find((x) => x.section === 'KINDERGARTEN')?.assessmentStyle ?? 'ratings';

      async function loadForClass(classId: string, streamId: string | null): Promise<Sheet[]> {
        const qs = new URLSearchParams({ classId });
        if (streamId) qs.set('streamId', streamId);
        const report = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error);
        if (!report) return [];
        // "Both" mode: a Nursery report card also carries the term's progress ratings.
        let ratings: {
          learningAreas: { id: string; name: string }[];
          pupils: { studentUserId: string; ratings: NurseryRatings['ratings'] }[];
        } | null = null;
        if (report.class.phase === 'KINDERGARTEN' && nurseryStyle === 'both') {
          ratings = await fetchOne(
            `/api/v1/early-years/sheet?classId=${classId}&termId=${report.exam.termId}`,
            toast.error,
          );
        }
        const students = studentIdParam ? report.students.filter((s) => s.studentUserId === studentIdParam) : report.students;
        return students.map((student) => ({
          student,
          exam: report.exam,
          klass: report.class,
          stream: report.stream,
          aggregation: report.aggregation,
          totalInClass: report.students.length,
          showPositions: report.showPositions,
          fields: report.reportCardFields,
          nurseryRatings: ratings
            ? {
                areas: ratings.learningAreas,
                ratings: ratings.pupils.find((p) => p.studentUserId === student.studentUserId)?.ratings ?? {},
              }
            : null,
        }));
      }

      if (wholeSchool) {
        if (!yearIdParam) {
          setError('Missing academic year — go back and try again from Report Card Studio.');
          setLoading(false);
          return;
        }
        const classList = await fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearIdParam}`, toast.error);
        // A Nursery on progress ratings sits no exams — its report lives under Kindergarten Progress.
        const examined = classList.filter((c) => c.stagePhase !== 'KINDERGARTEN' || nurseryStyle !== 'ratings');
        const perClass = await Promise.all(examined.map((c) => loadForClass(c.id, null)));
        setSheets(perClass.flat());
      } else if (classIdParam) {
        setSheets(await loadForClass(classIdParam, streamIdParam));
      } else {
        setError('No class specified.');
      }
      setLoading(false);
    })();
  }, [examId, wholeSchool, yearIdParam, classIdParam, streamIdParam, studentIdParam]);

  const bands = useMemo(() => bandsFrom(gradingSchemes), [gradingSchemes]);

  const backHref = useMemo(() => {
    if (!classIdParam) return `${base}/report-card-studio`;
    const p = new URLSearchParams({ classId: classIdParam });
    if (streamIdParam) p.set('stream', streamIdParam);
    return `${base}/report-card-studio?${p.toString()}`;
  }, [base, classIdParam, streamIdParam]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/exams/${examId}/report-cards/pdf?${search.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.message ?? `The PDF request failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report-cards.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reach the server — check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg-card px-6 py-3">
        <Link href={backHref} className="text-sm text-primary-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to Report Card Studio
        </Link>
        {!loading && sheets.length > 0 && base === '/dos' && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden /> Print
          </button>
        )}
        {/* The server-side PDF renders the admin portal's page, which the DOS's
            teacher login can't open — in the DOS portal, use the browser's Print. */}
        {!loading && sheets.length > 0 && base === '/school-admin' && (
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden /> {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        )}
      </div>

      {loading && (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      )}

      {!loading && error && <p className="text-sm text-text-muted text-center py-16">{error}</p>}

      {!loading && !error && sheets.length === 0 && (
        <p className="text-sm text-text-muted text-center py-16">No students to generate report cards for.</p>
      )}

      {!loading &&
        !error &&
        sheets.map((sheet) => (
          <StudentReportCardSheet
            key={sheet.student.studentUserId}
            sheet={sheet}
            schoolInfo={schoolInfo ?? (user ? { name: user.school, district: null, address: null, logoUrl: user.logoUrl ?? null } : null)}
            {...bands}
          />
        ))}
    </div>
  );
}

export default function ReportCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      }
    >
      <ReportCardsContent />
    </Suspense>
  );
}
