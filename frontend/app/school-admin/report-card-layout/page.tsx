'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { SECTION_LABEL, SECTION_LEVELS, useSchoolSections, type SchoolLevel, type SchoolSection } from '@/lib/levels';
import type { SchoolExam } from '@/components/admin/exams/types';
import {
  REPORT_CARD_FIELD_GROUPS,
  StudentReportCardSheet,
  bandsFrom,
  defaultReportCardFields,
  type ExamReportCard,
  type NurseryRatings,
  type ReportCardField,
  type ReportCardFields,
  type SchoolGradingSchemeSelection,
  type SchoolInfo,
} from '@/components/admin/report-cards/ReportCardSheet';
import { ArrowLeft, RotateCcw } from 'lucide-react';

// Report Card Layout — the school chooses what its printed report cards show,
// per section (Nursery, Primary and Secondary each have their own), with a
// live preview of a real learner's card from the latest exam.

interface SectionSettings {
  section: SchoolSection;
  assessmentStyle: string | null;
  showPositions: boolean;
  reportCard: ReportCardFields;
}
interface AcademicYear {
  id: string;
  isCurrent: boolean;
}
interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: SchoolLevel;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary-700' : 'bg-bg-muted border border-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function ReportCardLayoutPage() {
  const toast = useToast();
  const { active: section } = useSchoolSections();

  const [saved, setSaved] = useState<{ fields: ReportCardFields; showPositions: boolean } | null>(null);
  const [fields, setFields] = useState<ReportCardFields | null>(null);
  const [showPositions, setShowPositions] = useState(true);
  const [saving, setSaving] = useState(false);

  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [schemes, setSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
  const [exam, setExam] = useState<SchoolExam | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [report, setReport] = useState<ExamReportCard | null>(null);
  const [studentId, setStudentId] = useState('');
  const [ratings, setRatings] = useState<{
    learningAreas: { id: string; name: string }[];
    pupils: { studentUserId: string; ratings: NurseryRatings['ratings'] }[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  // The section's saved choices.
  useEffect(() => {
    if (!section) return;
    void (async () => {
      const list = await fetchList<SectionSettings>('/api/v1/academic/section-settings', toast.error);
      const mine = list.find((s) => s.section === section);
      const base = mine?.reportCard ?? defaultReportCardFields(section);
      const positions = mine?.showPositions ?? section !== 'KINDERGARTEN';
      setSaved({ fields: base, showPositions: positions });
      setFields(base);
      setShowPositions(positions);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // A real learner to preview: the latest exam with results in this section.
  useEffect(() => {
    if (!section) return;
    void (async () => {
      setLoadingPreview(true);
      const [school, gradingSchemes, years] = await Promise.all([
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
        fetchList<AcademicYear>('/api/v1/academic/years', toast.error),
      ]);
      setSchoolInfo(school);
      setSchemes(gradingSchemes);
      const year = years.find((y) => y.isCurrent) ?? years[0];
      if (!year) {
        setLoadingPreview(false);
        return;
      }
      const [exams, classList] = await Promise.all([
        fetchList<SchoolExam>(`/api/v1/exams?academicYearId=${year.id}`, toast.error),
        fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${year.id}`, toast.error),
      ]);
      const mine = classList.filter((c) => SECTION_LEVELS[section].includes(c.stagePhase));
      const published = exams.filter((e) => e.publishedAt).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
      setExam(published[0] ?? exams[0] ?? null);
      setClasses(mine);
      setClassId(mine[mine.length - 1]?.id ?? '');
      if (!mine.length) setLoadingPreview(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (!exam || !classId) return;
    void (async () => {
      setLoadingPreview(true);
      const data = await fetchOne<ExamReportCard>(`/api/v1/exams/${exam.id}/report-card?classId=${classId}`, toast.error);
      setReport(data);
      // Prefer a learner with a photo, so the photo box shows what it does.
      setStudentId((data?.students.find((s) => s.photoUrl) ?? data?.students[0])?.studentUserId ?? '');
      const nurseryBoth =
        data?.class.phase === 'KINDERGARTEN' &&
        schoolInfo?.sectionSettings?.find((x) => x.section === 'KINDERGARTEN')?.assessmentStyle === 'both';
      setRatings(
        nurseryBoth
          ? await fetchOne(`/api/v1/early-years/sheet?classId=${classId}&termId=${data!.exam.termId}`, toast.error)
          : null,
      );
      setLoadingPreview(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, classId, schoolInfo]);

  const bands = useMemo(() => bandsFrom(schemes), [schemes]);
  const student = report?.students.find((s) => s.studentUserId === studentId) ?? null;
  const dirty =
    !!saved &&
    !!fields &&
    (saved.showPositions !== showPositions || (Object.keys(fields) as ReportCardField[]).some((k) => fields[k] !== saved.fields[k]));

  async function save() {
    if (!section || !fields) return;
    setSaving(true);
    const applicable: Partial<ReportCardFields> = {};
    for (const group of REPORT_CARD_FIELD_GROUPS) {
      for (const f of group.fields) if (f.sections.includes(section)) applicable[f.key] = fields[f.key];
    }
    const res = await submitJson<SectionSettings>('/api/v1/academic/section-settings', 'PUT', {
      section,
      showPositions,
      reportCard: applicable,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    setSaved({ fields, showPositions });
    toast.success('Report card layout saved. New report cards will use it.');
  }

  if (!section || !fields) {
    return (
      <div className="py-16 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }

  const groups = REPORT_CARD_FIELD_GROUPS.map((g) => ({
    ...g,
    fields: g.fields.filter((f) => f.sections.includes(section)),
  })).filter((g) => g.fields.length > 0);

  return (
    <div className="max-w-[1320px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/school-admin/report-card-studio" className="text-sm text-primary-700 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Report Card Studio
          </Link>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight">
            Report card layout — {SECTION_LABEL[section]}
          </h1>
          <p className="text-sm text-text-muted mt-1 max-w-prose">
            {`Choose what your ${SECTION_LABEL[section]} report cards show. The preview is a real learner's card and changes as you go; printed cards change only when you save.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            inline
            onClick={() => {
              setFields(defaultReportCardFields(section));
              setShowPositions(section !== 'KINDERGARTEN');
            }}
          >
            <RotateCcw className="w-4 h-4" aria-hidden /> Defaults
          </Button>
          <Button inline onClick={() => void save()} isLoading={saving} disabled={!dirty || saving}>
            {dirty ? 'Save layout' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        <Card className="lg:sticky lg:top-4 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-faint mb-2">{group.title}</p>
              <ul className="space-y-2.5">
                {group.fields.map((f) => (
                  <li key={f.key} className="flex items-start justify-between gap-3">
                    <span className="text-sm text-primary-900">
                      {f.label}
                      {f.hint && <span className="block text-xs text-text-muted">{f.hint}</span>}
                    </span>
                    <Switch
                      label={f.label}
                      checked={fields[f.key]}
                      onChange={(v) => setFields({ ...fields, [f.key]: v })}
                    />
                  </li>
                ))}
                {group.title === 'Learner details' && (
                  <li className="flex items-start justify-between gap-3">
                    <span className="text-sm text-primary-900">
                      Position in class
                      <span className="block text-xs text-text-muted">e.g. &ldquo;7 of 39&rdquo;.</span>
                    </span>
                    <Switch label="Position in class" checked={showPositions} onChange={setShowPositions} />
                  </li>
                )}
              </ul>
            </div>
          ))}
        </Card>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-primary-900 mr-1">Preview</span>
            {classes.length > 0 && (
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                aria-label="Class to preview"
                className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.stageName}</option>
                ))}
              </select>
            )}
            {report && report.students.length > 0 && (
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                aria-label="Learner to preview"
                className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900 max-w-[16rem]"
              >
                {report.students.map((s) => (
                  <option key={s.studentUserId} value={s.studentUserId}>{s.studentName}</option>
                ))}
              </select>
            )}
            {exam && <span className="text-xs text-text-muted">{exam.name} · {exam.termName}</span>}
          </div>

          {loadingPreview ? (
            <div className="py-16 flex justify-center">
              <Loader size={44} />
            </div>
          ) : report && student ? (
            <div className="rounded-card border border-border bg-bg-canvas p-3 overflow-x-auto">
              <div className="min-w-[640px]">
                <StudentReportCardSheet
                  sheet={{
                    student,
                    exam: report.exam,
                    klass: report.class,
                    stream: null,
                    aggregation: report.aggregation,
                    totalInClass: report.students.length,
                    showPositions,
                    fields,
                    nurseryRatings: ratings
                      ? {
                          areas: ratings.learningAreas,
                          ratings: ratings.pupils.find((p) => p.studentUserId === student.studentUserId)?.ratings ?? {},
                        }
                      : null,
                  }}
                  schoolInfo={schoolInfo}
                  {...bands}
                />
              </div>
            </div>
          ) : (
            <Card>
              <p className="text-sm text-text-muted text-center py-10">
                The preview shows a learner&apos;s card once this section has an exam and learners. You can still choose
                the layout now.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
