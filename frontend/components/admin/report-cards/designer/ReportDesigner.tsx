'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Award,
  Bold,
  BookOpen,
  CalendarDays,
  ClipboardCopy,
  ClipboardPaste,
  Columns3,
  Copy,
  Database,
  Eye,
  FileDown,
  FileText,
  Filter,
  Frame,
  Grid3x3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Magnet,
  Maximize2,
  Minus,
  MoveHorizontal,
  PanelRight,
  PenLine,
  Plus,
  Redo2,
  Save,
  ScrollText,
  Shuffle,
  Signature,
  Square,
  Star,
  Table2,
  Trash2,
  Type,
  Undo2,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { SECTION_LABEL, SECTION_LEVELS, LEVEL_LABEL, type SchoolLevel } from '@/lib/levels';
import { localIsoDate } from '@/lib/school-admin/dashboard';
import { examRuleParams } from '@/lib/reports/report-options';
import { generateSampleReport } from '@/lib/reports/sample-report';
import type { SchoolExam } from '@/components/admin/exams/types';
import {
  StudentReportCardSheet,
  bandsFrom,
  buildCardParts,
  defaultReportCardFields,
  type ExamReportCard,
  type SchoolGradingSchemeSelection,
  type SchoolInfo,
  type Sheet,
} from '../ReportCardSheet';
import {
  BLOCK_INFO,
  DATA_FIELDS,
  PAGE_MM,
  PX_PER_MM,
  newBlockId,
  type BlockType,
  type CanvasBlock,
  type ReportCardTemplate,
  type TemplateDesign,
  type TemplateListing,
  type TemplateStyle,
} from '../templates';
import { useHistory } from './history';
import { DesignerCanvas } from './DesignerCanvas';
import { TaskPane, type PaneMode } from './TaskPane';
import { CheckRow, DropButton, LargeButton, RibbonColor, RibbonColumn, RibbonGroup, RibbonSelect, SmallButton } from './ribbon';

// The Report Designer — a full-screen editor for one of the school's report
// card templates, laid out like an Office app: a title bar (quick save, undo,
// redo), ribbon tabs (File, Home, Insert, Design, Data, Rules, View), the page
// as the workspace, a task pane for detailed formatting and rules, and a
// status bar. The preview runs on a made-up learner generated in the browser
// (shuffle for another) or on a real learner from the school's latest exam.

type Tab = 'file' | 'home' | 'insert' | 'design' | 'data' | 'rules' | 'view';
const TABS: { key: Tab; label: string }[] = [
  { key: 'file', label: 'File' },
  { key: 'home', label: 'Home' },
  { key: 'insert', label: 'Insert' },
  { key: 'design', label: 'Design' },
  { key: 'data', label: 'Data' },
  { key: 'rules', label: 'Rules' },
  { key: 'view', label: 'View' },
];

interface Draft {
  name: string;
  design: TemplateDesign;
}
interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: SchoolLevel;
}
interface AcademicYear {
  id: string;
  isCurrent: boolean;
}

const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function ReportDesigner({ templateId }: { templateId: string }) {
  const router = useRouter();
  const toast = useToast();

  // ── The template ──
  const [template, setTemplate] = useState<ReportCardTemplate | null>(null);
  const [listing, setListing] = useState<TemplateListing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const history = useHistory<Draft | null>(null);
  const draft = history.value;
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = !!draft && JSON.stringify(draft) !== savedJson;

  // ── Chrome ──
  const [tab, setTab] = useState<Tab>('home');
  const [pane, setPane] = useState<PaneMode | null>('format');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [showHidden, setShowHidden] = useState(true);
  const [clipboard, setClipboard] = useState<CanvasBlock | null>(null);
  const [leaving, setLeaving] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // ── Data ──
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [schemes, setSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
  const [showPositions, setShowPositions] = useState(true);
  const [source, setSource] = useState<'sample' | 'real'>('sample');
  const [level, setLevel] = useState<SchoolLevel>('O_LEVEL');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [subjectCount, setSubjectCount] = useState(0);
  const [absences, setAbsences] = useState(true);
  const [live, setLive] = useState(false);
  const [exams, setExams] = useState<SchoolExam[]>([]);
  const [examId, setExamId] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [report, setReport] = useState<ExamReportCard | null>(null);
  const [studentId, setStudentId] = useState('');
  const [loadingReal, setLoadingReal] = useState(false);

  const section = template?.section ?? null;
  const design = draft?.design ?? null;
  const kind = template?.kind ?? 'styled';
  const isCanvas = kind === 'canvas';
  const blocks = design?.blocks ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Load the template and everything the preview needs.
  useEffect(() => {
    void (async () => {
      const [lists, school, gradingSchemes, settings, years] = await Promise.all([
        fetchList<TemplateListing>('/api/v1/academic/report-card-templates', toast.error),
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
        fetchList<{ section: string; showPositions: boolean }>('/api/v1/academic/section-settings', toast.error),
        fetchList<AcademicYear>('/api/v1/academic/years', toast.error),
      ]);
      const mine = lists.find((l) => l.templates.some((t) => t.id === templateId)) ?? null;
      const t = mine?.templates.find((x) => x.id === templateId) ?? null;
      if (!t || t.builtIn) {
        setLoadError(t ? 'Ready-made templates can’t be edited — customise a copy first.' : 'This template no longer exists.');
        return;
      }
      setListing(mine);
      setTemplate(t);
      const start = { name: t.name, design: t.design };
      history.reset(start);
      setSavedJson(JSON.stringify(start));
      setSchoolInfo(school);
      setSchemes(gradingSchemes);
      setShowPositions(settings.find((s) => s.section === t.section)?.showPositions ?? t.section !== 'KINDERGARTEN');
      setLevel(SECTION_LEVELS[t.section][0]);
      const year = years.find((y) => y.isCurrent) ?? years[0];
      if (year) {
        const [examList, classList] = await Promise.all([
          fetchList<SchoolExam>(`/api/v1/exams?academicYearId=${year.id}`, toast.error),
          fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${year.id}`, toast.error),
        ]);
        const today = localIsoDate(new Date());
        const started = examList.filter((e) => e.startsOn <= today).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
        const inSection = classList.filter((c) => SECTION_LEVELS[t.section].includes(c.stagePhase));
        setExams(examList);
        setExamId((started[0] ?? examList[0])?.id ?? '');
        setClasses(inSection);
        setClassId(inSection[inSection.length - 1]?.id ?? '');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const bands = useMemo(() => bandsFrom(schemes), [schemes]);
  const fields = useMemo(() => (section && design ? { ...defaultReportCardFields(section), ...design.fields } : null), [section, design]);

  // Live sample data: a new made-up learner every few seconds.
  useEffect(() => {
    if (!live || source !== 'sample') return;
    const timer = setInterval(() => setSeed((s) => s + 1), 2500);
    return () => clearInterval(timer);
  }, [live, source]);

  // A real learner, with the exams the draft's rule picks.
  const examRuleKey = JSON.stringify(design?.rules.exams ?? null);
  useEffect(() => {
    if (source !== 'real' || !examId || !classId || !design) return;
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingReal(true);
        const params = examRuleParams(design.rules.exams, examId, exams, localIsoDate(new Date()));
        const qs = new URLSearchParams({ classId, ...params });
        const data = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error);
        setReport(data);
        setStudentId((prev) => (data?.students.some((s) => s.studentUserId === prev) ? prev : (data?.students.find((s) => s.photoUrl) ?? data?.students[0])?.studentUserId ?? ''));
        setLoadingReal(false);
      })();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, examId, classId, examRuleKey, exams]);

  // The card being previewed.
  const preview = useMemo((): { sheet: Sheet; school: SchoolInfo } | null => {
    if (!template || !design || !fields) return null;
    const withTemplate = (sheet: Sheet): Sheet => ({ ...sheet, fields, showPositions, template: { ...template, design } });
    if (source === 'sample') {
      const sample = generateSampleReport({
        level,
        seed,
        bands,
        examRule: design.rules.exams,
        fields,
        showPositions,
        absences,
        subjectCount: subjectCount || undefined,
      });
      return { sheet: withTemplate(sample.sheet), school: schoolInfo ?? sample.schoolInfo };
    }
    const student = report?.students.find((s) => s.studentUserId === studentId);
    if (!report || !student) return null;
    return {
      sheet: withTemplate({
        student,
        exam: report.exam,
        klass: report.class,
        stream: null,
        aggregation: report.aggregation,
        totalInClass: report.students.length,
        showPositions,
        fields,
        nurseryRatings: null,
        mode: report.mode,
        compared: report.compared,
      }),
      school: schoolInfo ?? { name: 'School', district: null, address: null, logoUrl: null },
    };
  }, [template, design, fields, source, level, seed, bands, showPositions, absences, subjectCount, schoolInfo, report, studentId]);
  const parts = useMemo(() => (preview && design ? buildCardParts(preview.sheet, preview.school, bands, design) : null), [preview, design, bands]);

  // Fit the page to the workspace's width.
  useLayoutEffect(() => {
    const el = workspaceRef.current;
    if (!el || !fit) return;
    const measure = () => {
      const pageWidth = (isCanvas ? PAGE_MM.width * PX_PER_MM : 816) + 64;
      setZoom(Math.max(0.4, Math.min(1.1, Math.floor((el.clientWidth / pageWidth) * 100) / 100)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, isCanvas, template, pane]);

  // ── Editing ──
  const setDesign = useCallback(
    (next: TemplateDesign | ((d: TemplateDesign) => TemplateDesign), group?: string) =>
      history.set((d) => (d ? { ...d, design: typeof next === 'function' ? next(d.design) : next } : d), group),
    [history],
  );
  const setBlocks = useCallback(
    (next: CanvasBlock[] | ((b: CanvasBlock[]) => CanvasBlock[]), group?: string) =>
      setDesign((d) => ({ ...d, blocks: typeof next === 'function' ? next(d.blocks ?? []) : next }), group),
    [setDesign],
  );
  const patchBlock = useCallback(
    (id: string, patch: Partial<CanvasBlock>, group?: string) =>
      setBlocks((list) =>
        list.map((b) => {
          if (b.id !== id) return b;
          const next = { ...b, ...patch };
          if ('showIf' in patch && !patch.showIf) delete next.showIf;
          return next;
        }),
      group),
    [setBlocks],
  );
  const setStyle = (patch: Partial<TemplateStyle>) => setDesign((d) => ({ ...d, style: { ...d.style, ...patch } }));

  function insert(type: BlockType, props: CanvasBlock['props'] = {}) {
    if (!isCanvas) return;
    const info = BLOCK_INFO[type];
    const base: CanvasBlock = {
      id: newBlockId(type),
      type,
      x: Math.round((PAGE_MM.width - info.w) / 2),
      y: 20,
      w: info.w,
      h: info.h,
      props:
        type === 'text'
          ? { text: 'Type here. Insert data like {learner.name}.', size: 11, align: 'left', color: '#1F2937', ...props }
          : type === 'field'
            ? { binding: 'learner.position', label: 'Position', labelPosition: 'left', size: 11, bold: true, align: 'left', color: '#1F2937', ...props }
            : props,
    };
    setBlocks((list) => [...list, base]);
    setSelectedId(base.id);
    setPane('format');
  }
  function remove() {
    if (!selected) return;
    setBlocks((list) => list.filter((b) => b.id !== selected.id));
    setSelectedId(null);
  }
  function duplicate(source: CanvasBlock | null = selected) {
    if (!source) return;
    const copy = { ...source, id: newBlockId(source.type), x: Math.min(source.x + 5, PAGE_MM.width - source.w), y: Math.min(source.y + 5, PAGE_MM.height - source.h) };
    setBlocks((list) => [...list, copy]);
    setSelectedId(copy.id);
  }
  function arrange(where: 'front' | 'back') {
    if (!selected) return;
    setBlocks((list) => {
      const rest = list.filter((b) => b.id !== selected.id);
      return where === 'front' ? [...rest, selected] : [selected, ...rest];
    });
  }
  function alignOnPage(where: 'left' | 'center' | 'right' | 'full') {
    if (!selected) return;
    const margin = 12;
    const patch: Partial<CanvasBlock> =
      where === 'left'
        ? { x: margin }
        : where === 'right'
          ? { x: PAGE_MM.width - margin - selected.w }
          : where === 'center'
            ? { x: Math.round(((PAGE_MM.width - selected.w) / 2) * 2) / 2 }
            : { x: margin, w: PAGE_MM.width - margin * 2 };
    patchBlock(selected.id, patch);
  }
  const textual = selected && ['text', 'field'].includes(selected.type);
  const sized = selected && ['text', 'field', 'schoolName'].includes(selected.type);
  const alignable = selected && ['schoolName', 'schoolDetails', 'examTitle', 'issuedDate', 'footerNote', 'text', 'field'].includes(selected.type);
  const prop = (patch: CanvasBlock['props'], group?: string) => selected && patchBlock(selected.id, { props: { ...selected.props, ...patch } }, group);

  // ── Saving ──
  async function save(): Promise<boolean> {
    if (!draft || !template) return false;
    if (!draft.name.trim()) {
      toast.error('Give the template a name.');
      return false;
    }
    setSaving(true);
    const res = await submitJson<ReportCardTemplate>(`/api/v1/academic/report-card-templates/${template.id}`, 'PUT', draft);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return false;
    }
    // The server cleans the design; keep its version so "saved" compares true.
    const saved = { name: res.data!.name, design: res.data!.design };
    setTemplate(res.data!);
    history.set(saved);
    setSavedJson(JSON.stringify(saved));
    toast.success('Template saved.');
    return true;
  }
  async function saveAsCopy() {
    if (!draft || !template) return;
    const taken = new Set(listing?.templates.map((t) => t.name.toLowerCase()));
    let name = `${draft.name} (copy)`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${draft.name} (copy ${n})`;
    const res = await submitJson<ReportCardTemplate>('/api/v1/academic/report-card-templates', 'POST', {
      section: template.section,
      name,
      kind: template.kind,
      design: draft.design,
    });
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success(`Saved as “${name}”.`);
    router.push(`/school-admin/report-card-designer/${res.data!.id}`);
  }
  async function makeDefault() {
    if (!template) return;
    if (dirty && !(await save())) return;
    const res = await submitJson('/api/v1/academic/report-card-templates/default', 'PUT', { section: template.section, templateId: template.id });
    if (res.ok) toast.success(`${SECTION_LABEL[template.section]} report cards now print with “${draft?.name}”.`);
    else toast.error(res.error!);
  }
  async function savePositions(value: boolean) {
    if (!section) return;
    setShowPositions(value);
    const res = await submitJson('/api/v1/academic/section-settings', 'PUT', { section, showPositions: value });
    if (!res.ok) {
      toast.error(res.error!);
      setShowPositions(!value);
    }
  }
  const close = () => (dirty ? setLeaving(true) : router.push('/school-admin/report-card-layout'));

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Keyboard shortcuts, as in Office.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        history.redo();
      } else if (mod && key === 'c' && selected) {
        e.preventDefault();
        setClipboard(selected);
      } else if (mod && key === 'v' && clipboard && isCanvas) {
        e.preventDefault();
        duplicate(clipboard);
      } else if (mod && key === 'd' && selected) {
        e.preventDefault();
        duplicate();
      } else if ((key === 'delete' || key === 'backspace') && selected) {
        e.preventDefault();
        remove();
      } else if (key === 'escape') {
        setSelectedId(null);
      } else if (selected && key.startsWith('arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key] ?? [0, 0];
        patchBlock(
          selected.id,
          {
            x: Math.min(Math.max(0, selected.x + d[0]), PAGE_MM.width - selected.w),
            y: Math.min(Math.max(0, selected.y + d[1]), PAGE_MM.height - selected.h),
          },
          `nudge-${selected.id}`,
        );
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-canvas flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-text-muted">{loadError}</p>
        <Button inline onClick={() => router.push('/school-admin/report-card-layout')}>
          Back to templates
        </Button>
      </div>
    );
  }
  if (!template || !draft || !design || !section) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-canvas flex items-center justify-center">
        <Loader size={44} />
      </div>
    );
  }

  const levels = SECTION_LEVELS[section];
  const builtInStyles = (listing?.templates ?? []).filter((t) => t.builtIn && t.kind === 'styled');
  const sampleName = preview?.sheet.student.studentName;
  const examRuleSummary =
    design.rules.exams.mode === 'opened'
      ? 'One exam'
      : `${design.rules.exams.mode === 'term' ? 'Whole term' : design.rules.exams.codes.join(' / ')}${design.rules.exams.combine ? ', combined' : ''}`;
  const openPane = (mode: PaneMode) => setPane((p) => (p === mode ? null : mode));
  const fieldItems = DATA_FIELDS.map((f) => ({
    label: f.label,
    group: f.group,
    onClick: () => insert('field', { binding: f.key, label: f.label.replace(/ \(.*\)$/, '') }),
  }));
  const zoomBy = (dir: 1 | -1) => {
    setFit(false);
    setZoom((z) => (dir > 0 ? ZOOMS.find((v) => v > z + 0.001) ?? z : [...ZOOMS].reverse().find((v) => v < z - 0.001) ?? z));
  };

  // ── Ribbon contents ──
  const ribbon: Record<Tab, React.ReactNode> = {
    file: (
      <>
        <RibbonGroup label="Save">
          <LargeButton icon={Save} label="Save" title="Save (Ctrl+S)" onClick={() => void save()} disabled={!dirty || saving} />
          <LargeButton icon={Copy} label="Save as copy" onClick={() => void saveAsCopy()} />
        </RibbonGroup>
        <RibbonGroup label="Use">
          <LargeButton icon={Star} label="Use by default" onClick={() => void makeDefault()} />
        </RibbonGroup>
        <RibbonGroup label="Template">
          <div className="flex flex-col justify-center gap-1 text-[12px] text-primary-900 px-1">
            <label className="flex items-center gap-1.5">
              <span className="text-text-muted">Name</span>
              <input
                value={draft.name}
                maxLength={60}
                onChange={(e) => history.set((d) => (d ? { ...d, name: e.target.value } : d), 'name')}
                className="h-6 w-56 rounded border border-border-strong px-1.5 text-[12px]"
              />
            </label>
            <span className="text-text-muted">
              {SECTION_LABEL[section]} · {isCanvas ? 'Page layout' : 'Styled'}
            </span>
          </div>
        </RibbonGroup>
        <RibbonGroup label="Close">
          <LargeButton icon={X} label="Close designer" onClick={close} />
        </RibbonGroup>
      </>
    ),
    home: (
      <>
        <RibbonGroup label="Clipboard">
          <LargeButton icon={ClipboardPaste} label="Paste" title="Paste (Ctrl+V)" onClick={() => duplicate(clipboard)} disabled={!clipboard || !isCanvas} />
          <RibbonColumn>
            <SmallButton icon={ClipboardCopy} label="Copy" title="Copy (Ctrl+C)" onClick={() => setClipboard(selected)} disabled={!selected} />
            <SmallButton icon={Copy} label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicate()} disabled={!selected} />
            <SmallButton icon={Trash2} label="Delete" title="Delete (Del)" onClick={remove} disabled={!selected} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Font">
          <RibbonColumn>
            <div className="flex items-center gap-1">
              <SmallButton icon={Minus} label="Smaller" iconOnly onClick={() => prop({ size: Math.max(6, Number(selected!.props.size ?? 11) - 1) }, 'size')} disabled={!sized} />
              <span className="w-10 text-center text-[12px] tabular-nums">{sized ? `${selected!.props.size ?? (selected!.type === 'schoolName' ? 18 : 11)}pt` : '—'}</span>
              <SmallButton icon={Plus} label="Bigger" iconOnly onClick={() => prop({ size: Math.min(48, Number(selected!.props.size ?? 11) + 1) }, 'size')} disabled={!sized} />
            </div>
            <div className="flex items-center gap-0.5">
              <SmallButton icon={Bold} label="Bold" iconOnly active={!!selected?.props.bold} onClick={() => prop({ bold: !selected!.props.bold })} disabled={!textual} />
              <SmallButton icon={Italic} label="Italic" iconOnly active={!!selected?.props.italic} onClick={() => prop({ italic: !selected!.props.italic })} disabled={selected?.type !== 'text'} />
              <SmallButton icon={Type} label="Capitals" iconOnly active={!!selected?.props.uppercase} onClick={() => prop({ uppercase: !selected!.props.uppercase })} disabled={selected?.type !== 'text'} />
            </div>
            <RibbonColor label="Colour" value={String(selected?.props.color ?? '#1F2937')} onChange={(color) => prop({ color }, 'color')} disabled={!textual} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Paragraph">
          <div className="flex items-center gap-0.5 self-center">
            <SmallButton icon={AlignLeft} label="Align left" iconOnly active={alignable ? (selected!.props.align ?? 'left') === 'left' : false} onClick={() => prop({ align: 'left' })} disabled={!alignable} />
            <SmallButton icon={AlignCenter} label="Centre" iconOnly active={selected?.props.align === 'center'} onClick={() => prop({ align: 'center' })} disabled={!alignable} />
            <SmallButton icon={AlignRight} label="Align right" iconOnly active={selected?.props.align === 'right'} onClick={() => prop({ align: 'right' })} disabled={!alignable} />
          </div>
        </RibbonGroup>
        <RibbonGroup label="Arrange">
          <RibbonColumn>
            <SmallButton icon={ArrowUpToLine} label="Bring to front" onClick={() => arrange('front')} disabled={!selected} />
            <SmallButton icon={ArrowDownToLine} label="Send to back" onClick={() => arrange('back')} disabled={!selected} />
            <SmallButton icon={MoveHorizontal} label="Full width" onClick={() => alignOnPage('full')} disabled={!selected} />
          </RibbonColumn>
          <RibbonColumn>
            <SmallButton icon={AlignLeft} label="Page left" onClick={() => alignOnPage('left')} disabled={!selected} />
            <SmallButton icon={AlignHorizontalJustifyCenter} label="Page centre" onClick={() => alignOnPage('center')} disabled={!selected} />
            <SmallButton icon={AlignRight} label="Page right" onClick={() => alignOnPage('right')} disabled={!selected} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Editing">
          <LargeButton icon={PenLine} label="Format pane" active={pane === 'format'} onClick={() => openPane('format')} />
        </RibbonGroup>
      </>
    ),
    insert: (
      <>
        <RibbonGroup label="Header">
          <LargeButton icon={LayoutTemplate} label="Full header" onClick={() => insert('header')} disabled={!isCanvas || blocks.some((b) => b.type === 'header')} />
          <RibbonColumn>
            <SmallButton icon={Type} label="School name" onClick={() => insert('schoolName', { align: 'center', size: 18 })} disabled={!isCanvas} />
            <SmallButton icon={ScrollText} label="Address & EMIS" onClick={() => insert('schoolDetails', { align: 'center' })} disabled={!isCanvas} />
            <SmallButton icon={CalendarDays} label="Exam & term" onClick={() => insert('examTitle', { align: 'center' })} disabled={!isCanvas} />
          </RibbonColumn>
          <RibbonColumn>
            <SmallButton icon={Award} label="Title badge" onClick={() => insert('badge')} disabled={!isCanvas} />
            <SmallButton icon={ImageIcon} label="School badge" onClick={() => insert('logo')} disabled={!isCanvas} />
            <SmallButton icon={User} label="Photo" onClick={() => insert('photo')} disabled={!isCanvas} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Learner & results">
          <LargeButton icon={Table2} label="Results table" onClick={() => insert('results')} disabled={!isCanvas || blocks.some((b) => b.type === 'results')} />
          <RibbonColumn>
            <SmallButton icon={User} label="Learner details" onClick={() => insert('learner')} disabled={!isCanvas} />
            <SmallButton icon={ListChecks} label="Average & grade" onClick={() => insert('summary')} disabled={!isCanvas} />
            <SmallButton icon={FileText} label="Remarks box" onClick={() => insert('remarks')} disabled={!isCanvas} />
          </RibbonColumn>
          <RibbonColumn>
            <SmallButton icon={KeyRound} label="Grading key" onClick={() => insert('gradingKey')} disabled={!isCanvas} />
            <SmallButton icon={Signature} label="Signatures" onClick={() => insert('signatures')} disabled={!isCanvas} />
            <SmallButton icon={CalendarDays} label="Date issued" onClick={() => insert('issuedDate')} disabled={!isCanvas} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Text & data">
          <LargeButton icon={Type} label="Text box" onClick={() => insert('text')} disabled={!isCanvas} />
          <DropButton icon={Database} label="Data field" items={fieldItems} disabled={!isCanvas} />
          <RibbonColumn>
            <SmallButton icon={ScrollText} label="Footer note" onClick={() => insert('footerNote', { align: 'center' })} disabled={!isCanvas} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Shapes">
          <RibbonColumn>
            <SmallButton icon={Minus} label="Line" onClick={() => insert('line', { thickness: 1, color: 'accent' })} disabled={!isCanvas} />
            <SmallButton icon={Square} label="Box" onClick={() => insert('box', { thickness: 1, color: 'accent', fill: '', radius: 0 })} disabled={!isCanvas} />
          </RibbonColumn>
        </RibbonGroup>
        {!isCanvas && (
          <p className="self-center px-3 text-[12px] text-text-muted max-w-xs">
            Styled templates flow top to bottom. To place blocks yourself, make a new template from <strong>Page layout</strong>.
          </p>
        )}
      </>
    ),
    design: (
      <>
        <RibbonGroup label="Themes">
          <div className="flex items-center gap-1.5 self-center">
            {builtInStyles.map((t) => (
              <button
                key={t.id}
                type="button"
                title={`Use ${t.name}'s frame, header and table`}
                onClick={() =>
                  setStyle({
                    accent: t.design.style.accent,
                    highlight: t.design.style.highlight,
                    font: t.design.style.font,
                    table: t.design.style.table,
                    density: t.design.style.density,
                    ...(isCanvas ? {} : { frame: t.design.style.frame, header: t.design.style.header }),
                  })
                }
                className="flex flex-col items-center gap-0.5 rounded-md border border-border px-2 py-1 hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="text-[10px] text-primary-900">{t.name}</span>
              </button>
            ))}
          </div>
        </RibbonGroup>
        <RibbonGroup label="Text & table">
          <RibbonColumn>
            <RibbonSelect
              label="Spacing"
              value={design.style.density}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
              onChange={(density) => setStyle({ density })}
            />
            <RibbonSelect
              label="Table"
              value={design.style.table}
              options={[
                { value: 'bordered', label: 'Grid' },
                { value: 'striped', label: 'Striped rows' },
                { value: 'minimal', label: 'Minimal lines' },
              ]}
              onChange={(table) => setStyle({ table })}
            />
          </RibbonColumn>
        </RibbonGroup>
        {!isCanvas && (
          <RibbonGroup label="Page">
            <RibbonColumn>
              <RibbonSelect
                label="Frame"
                value={design.style.frame}
                options={[
                  { value: 'double', label: 'Double' },
                  { value: 'single', label: 'Single' },
                  { value: 'none', label: 'None' },
                ]}
                onChange={(frame) => setStyle({ frame })}
                width="w-24"
              />
              <RibbonSelect
                label="Header"
                value={design.style.header}
                options={[
                  { value: 'centered', label: 'Centred' },
                  { value: 'left', label: 'Left' },
                ]}
                onChange={(header) => setStyle({ header })}
                width="w-24"
              />
            </RibbonColumn>
          </RibbonGroup>
        )}
        <RibbonGroup label="Content">
          <LargeButton icon={ScrollText} label="Wording" active={pane === 'wording'} onClick={() => openPane('wording')} />
          <LargeButton icon={Eye} label="Show / hide parts" active={pane === 'show'} onClick={() => openPane('show')} />
        </RibbonGroup>
        <RibbonGroup label="Panes">
          <LargeButton icon={Frame} label="Format pane" active={pane === 'format'} onClick={() => openPane('format')} />
        </RibbonGroup>
      </>
    ),
    data: (
      <>
        <RibbonGroup label="Preview with">
          <LargeButton icon={Shuffle} label="Sample learner" active={source === 'sample'} onClick={() => setSource('sample')} />
          <LargeButton icon={User} label="Real learner" active={source === 'real'} onClick={() => setSource('real')} disabled={classes.length === 0 || exams.length === 0} />
        </RibbonGroup>
        {source === 'sample' ? (
          <>
            <RibbonGroup label="Sample learner">
              <LargeButton icon={Shuffle} label="Shuffle" title="Make up another learner" onClick={() => setSeed((s) => s + 1)} />
              <RibbonColumn>
                <RibbonSelect label="Level" value={level} options={levels.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} onChange={setLevel} disabled={levels.length < 2} width="w-28" />
                {level === 'O_LEVEL' && (
                  <RibbonSelect
                    label="Subjects"
                    value={String(subjectCount)}
                    options={[{ value: '0', label: 'Any (9–12)' }, ...[7, 8, 9, 10, 11, 12, 13, 14].map((n) => ({ value: String(n), label: String(n) }))]}
                    onChange={(v) => setSubjectCount(Number(v))}
                    width="w-24"
                  />
                )}
                <CheckRow label="Some absences" checked={absences} onChange={setAbsences} />
              </RibbonColumn>
            </RibbonGroup>
            <RibbonGroup label="Live">
              <RibbonColumn>
                <CheckRow label="New learner every few seconds" checked={live} onChange={setLive} />
                <span className="text-[11px] text-text-muted">Try long names and low marks.</span>
              </RibbonColumn>
            </RibbonGroup>
          </>
        ) : (
          <RibbonGroup label="Real learner">
            <RibbonColumn>
              <RibbonSelect label="Exam" value={examId} options={exams.map((e) => ({ value: e.id, label: `${e.name} · ${e.termName}` }))} onChange={setExamId} width="w-52" />
              <RibbonSelect label="Class" value={classId} options={classes.map((c) => ({ value: c.id, label: c.stageName }))} onChange={setClassId} width="w-40" />
              <RibbonSelect
                label="Learner"
                value={studentId}
                options={(report?.students ?? []).map((s) => ({ value: s.studentUserId, label: s.studentName }))}
                onChange={setStudentId}
                width="w-48"
              />
            </RibbonColumn>
          </RibbonGroup>
        )}
      </>
    ),
    rules: (
      <>
        <RibbonGroup label="Exams">
          <LargeButton icon={Columns3} label="Exam columns" active={pane === 'exams'} onClick={() => openPane('exams')} />
          <RibbonColumn>
            <span className="text-[11px] text-text-muted">Now:</span>
            <span className="text-[12px] font-semibold text-primary-900 max-w-36">{examRuleSummary}</span>
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Results table">
          <LargeButton icon={Highlighter} label="Highlights" active={pane === 'highlights'} onClick={() => openPane('highlights')} />
          <LargeButton icon={Columns3} label="Column order" active={pane === 'columns'} onClick={() => openPane('columns')} />
          <LargeButton icon={Eye} label="Show / hide parts" active={pane === 'show'} onClick={() => openPane('show')} />
        </RibbonGroup>
        <RibbonGroup label="Blocks">
          <LargeButton
            icon={Filter}
            label="Show if…"
            title="Print the selected block only when a condition holds"
            active={pane === 'format' && !!selected?.showIf}
            onClick={() => setPane('format')}
            disabled={!selected}
          />
          <RibbonColumn>
            <span className="text-[11px] text-text-muted max-w-48 leading-tight">
              {selected
                ? selected.showIf
                  ? 'This block has a condition — see the Format pane.'
                  : 'Select Show if… to print this block only for some learners.'
                : 'Select a block first.'}
            </span>
          </RibbonColumn>
        </RibbonGroup>
      </>
    ),
    view: (
      <>
        <RibbonGroup label="Zoom">
          <LargeButton icon={ZoomIn} label="Zoom in" onClick={() => zoomBy(1)} />
          <LargeButton icon={ZoomOut} label="Zoom out" onClick={() => zoomBy(-1)} />
          <RibbonColumn>
            <SmallButton icon={Maximize2} label="Fit width" active={fit} onClick={() => setFit(true)} />
            <SmallButton
              icon={BookOpen}
              label="100%"
              active={!fit && zoom === 1}
              onClick={() => {
                setFit(false);
                setZoom(1);
              }}
            />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Show">
          <RibbonColumn>
            <CheckRow label="Gridlines" checked={showGrid} onChange={setShowGrid} disabled={!isCanvas} />
            <CheckRow label="Snap to grid" checked={snap} onChange={setSnap} disabled={!isCanvas} />
            <CheckRow label="Blocks hidden by a rule" checked={showHidden} onChange={setShowHidden} disabled={!isCanvas} />
          </RibbonColumn>
        </RibbonGroup>
        <RibbonGroup label="Panes">
          <LargeButton icon={PanelRight} label="Task pane" active={!!pane} onClick={() => setPane((p) => (p ? null : 'format'))} />
        </RibbonGroup>
      </>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F3F2F1] text-primary-900">
      {/* Title bar */}
      <div className="flex items-center gap-2 h-10 px-2 bg-primary-700 text-white shrink-0">
        <LayoutTemplate className="w-5 h-5 ml-1" aria-hidden />
        <div className="flex items-center gap-0.5 ml-2">
          {[
            { icon: Save, label: 'Save (Ctrl+S)', onClick: () => void save(), disabled: !dirty || saving },
            { icon: Undo2, label: 'Undo (Ctrl+Z)', onClick: history.undo, disabled: !history.canUndo },
            { icon: Redo2, label: 'Redo (Ctrl+Y)', onClick: history.redo, disabled: !history.canRedo },
          ].map(({ icon: Icon, label, onClick, disabled }) => (
            <button key={label} type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="p-1.5 rounded hover:bg-white/15 disabled:opacity-40">
              <Icon className="w-4 h-4" aria-hidden />
            </button>
          ))}
        </div>
        <p className="flex-1 text-center text-[13px] truncate">
          {draft.name || 'Untitled'} {dirty ? '•' : ''} — Report Designer
        </p>
        <button type="button" onClick={close} title="Close" aria-label="Close designer" className="p-1.5 rounded hover:bg-white/15">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-0.5 px-2 bg-white border-b border-border shrink-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 h-8 text-[13px] border-b-2 ${
              tab === t.key ? 'border-primary-700 text-primary-700 font-semibold' : 'border-transparent text-primary-900 hover:bg-bg-subtle'
            } ${t.key === 'file' ? 'text-primary-700 font-semibold' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ribbon */}
      <div className="flex items-stretch bg-white border-b border-border px-1 py-1 overflow-x-auto shrink-0 min-h-[92px]">{ribbon[tab]}</div>

      {/* Workspace + task pane */}
      <div className="flex flex-1 min-h-0">
        <div ref={workspaceRef} className="flex-1 overflow-auto p-8" onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
          {source === 'real' && (loadingReal || !preview) ? (
            <div className="py-24 flex flex-col items-center gap-3">
              {loadingReal ? <Loader size={40} /> : <p className="text-sm text-text-muted">Choose an exam, class and learner on the Data tab.</p>}
            </div>
          ) : isCanvas ? (
            <DesignerCanvas
              design={design}
              parts={parts}
              zoom={zoom}
              showGrid={showGrid}
              snap={snap}
              showHidden={showHidden}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id && !pane) setPane('format');
              }}
              onChange={(next, group) => setBlocks(next, group)}
            />
          ) : preview ? (
            <div className="mx-auto bg-white shadow-[0_1px_6px_rgba(13,33,55,0.25)] w-fit" style={{ zoom }}>
              <StudentReportCardSheet sheet={preview.sheet} schoolInfo={preview.school} {...bands} />
            </div>
          ) : null}
        </div>
        {pane && (
          <TaskPane
            mode={pane}
            section={section}
            kind={kind}
            design={design}
            block={selected}
            onBlock={(patch, group) => selected && patchBlock(selected.id, patch, group)}
            onDesign={(d, group) => setDesign(d, group)}
            showPositions={showPositions}
            onShowPositions={(v) => void savePositions(v)}
            onClose={() => setPane(null)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 h-7 px-3 bg-primary-700 text-white text-[11px] shrink-0">
        <span>Page 1 of 1</span>
        <span className="opacity-80">{isCanvas ? 'Page layout' : 'Styled'} · {SECTION_LABEL[section]}</span>
        {selected && (
          <span className="opacity-90">
            {BLOCK_INFO[selected.type].label} · {selected.x}, {selected.y} mm · {selected.w} × {selected.h} mm
            {selected.showIf ? ' · has a condition' : ''}
          </span>
        )}
        <span className="flex items-center gap-1 opacity-90">
          {source === 'sample' ? <Shuffle className="w-3 h-3" aria-hidden /> : <User className="w-3 h-3" aria-hidden />}
          {source === 'sample' ? 'Sample' : 'Real'}: {sampleName ?? '—'}
          {live && source === 'sample' ? ' (live)' : ''}
        </span>
        <span className="opacity-90">Exams: {examRuleSummary}</span>
        <span className="ml-auto flex items-center gap-1">
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className="hover:bg-white/15 rounded px-1">
            −
          </button>
          <input
            type="range"
            min={40}
            max={200}
            value={Math.round(zoom * 100)}
            onChange={(e) => {
              setFit(false);
              setZoom(Number(e.target.value) / 100);
            }}
            aria-label="Zoom"
            className="w-24 accent-white"
          />
          <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className="hover:bg-white/15 rounded px-1">
            +
          </button>
          <span className="w-9 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
        </span>
      </div>

      <Modal open={leaving} onClose={() => setLeaving(false)} title="Save changes?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">“{draft.name}” has changes that aren&apos;t saved.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" inline onClick={() => router.push('/school-admin/report-card-layout')}>
              Don&apos;t save
            </Button>
            <Button variant="outline" inline onClick={() => setLeaving(false)}>
              Cancel
            </Button>
            <Button
              inline
              onClick={() =>
                void (async () => {
                  if (await save()) router.push('/school-admin/report-card-layout');
                })()
              }
            >
              <FileDown className="w-4 h-4" aria-hidden /> Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

