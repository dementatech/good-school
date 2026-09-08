'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Plus, Trash2 } from 'lucide-react';
import {
  CombinationPicker,
  OLevelOptionalsChecklist,
  emptyCombinationChoice,
  type CombinationChoice,
} from './StudentSubjectsPanel';
import {
  ENTRY_TYPES,
  ENTRY_TYPE_LABEL,
  GENDERS,
  GUARDIAN_ROLES,
  LIN_STATUSES,
  LIN_STATUS_LABEL,
  PLE_DIVISIONS,
  UCE_RESULTS,
  type AcademicYear,
  type EntryType,
  type Gender,
  type GuardianRole,
  type LinStatus,
  type PriorExamType,
  type SchoolClass,
  type Stream,
  type Student,
} from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

// ─── shared identity state ───────────────────────────────────────────────────

type IdentityState = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | '';
  lin: string;
  linStatus: LinStatus;
  email: string;
  phoneNumber: string;
};

function initialIdentity(s?: Student): IdentityState {
  return {
    firstName: s?.firstName ?? '',
    middleName: s?.middleName ?? '',
    lastName: s?.lastName ?? '',
    dateOfBirth: s?.dateOfBirth ?? '',
    gender: s?.gender ?? '',
    lin: s?.lin ?? '',
    linStatus: s?.linStatus ?? 'not_yet_issued',
    email: s?.email ?? '',
    phoneNumber: s?.phoneNumber ?? '',
  };
}

const trimOrNull = (v: string) => v.trim() || null;

function identityPayload(identity: IdentityState) {
  return {
    firstName: identity.firstName.trim(),
    middleName: trimOrNull(identity.middleName),
    lastName: identity.lastName.trim(),
    dateOfBirth: trimOrNull(identity.dateOfBirth),
    gender: identity.gender || null,
    lin: trimOrNull(identity.lin),
    linStatus: identity.linStatus,
    email: trimOrNull(identity.email),
    phoneNumber: trimOrNull(identity.phoneNumber),
  };
}

function IdentityFields({
  identity,
  set,
}: {
  identity: IdentityState;
  set: <K extends keyof IdentityState>(k: K, v: IdentityState[K]) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="First name" value={identity.firstName} onChange={(e) => set('firstName', e.target.value)} required />
        <Input label="Middle name" value={identity.middleName} onChange={(e) => set('middleName', e.target.value)} />
        <Input label="Last name" value={identity.lastName} onChange={(e) => set('lastName', e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Date of birth" type="date" value={identity.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
        <Select
          label="Gender"
          value={identity.gender}
          onChange={(e) => set('gender', e.target.value as Gender | '')}
          options={[{ value: '', label: '—' }, ...GENDERS.map((g) => ({ value: g, label: g }))]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="LIN (Learner Identification Number)"
          value={identity.lin}
          onChange={(e) => set('lin', e.target.value)}
          placeholder="Leave blank if not yet issued"
        />
        <Select
          label="LIN status"
          value={identity.linStatus}
          onChange={(e) => set('linStatus', e.target.value as LinStatus)}
          options={LIN_STATUSES.map((s) => ({ value: s, label: LIN_STATUS_LABEL[s] }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Student email (optional)" type="email" value={identity.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Student phone (optional)" value={identity.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} />
      </div>
    </>
  );
}

// ─── guardians ───────────────────────────────────────────────────────────────

interface GuardianRow {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  relationshipToStudent: string;
  role: GuardianRole;
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

function emptyGuardian(first = false): GuardianRow {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    relationshipToStudent: '',
    role: 'parent',
    isPrimaryContact: first,
    isFeeResponsible: first,
    isEmergencyContact: first,
  };
}

function GuardiansFields({
  guardians,
  setGuardians,
}: {
  guardians: GuardianRow[];
  setGuardians: React.Dispatch<React.SetStateAction<GuardianRow[]>>;
}) {
  const update = (i: number, patch: Partial<GuardianRow>) =>
    setGuardians((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      {guardians.map((g, i) => (
        <div key={i} className="rounded-xl border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Guardian {i + 1}</span>
            {guardians.length > 1 && (
              <button
                type="button"
                onClick={() => setGuardians((rows) => rows.filter((_, idx) => idx !== i))}
                className="text-text-faint hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="First name" value={g.firstName} onChange={(e) => update(i, { firstName: e.target.value })} required />
            <Input label="Last name" value={g.lastName} onChange={(e) => update(i, { lastName: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Phone"
              value={g.phone}
              onChange={(e) => update(i, { phone: e.target.value })}
              placeholder="A matching phone reuses an existing guardian"
            />
            <Input label="Email (optional)" type="email" value={g.email} onChange={(e) => update(i, { email: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Relationship to student"
              value={g.relationshipToStudent}
              onChange={(e) => update(i, { relationshipToStudent: e.target.value })}
              placeholder="Mother, Father, Aunt…"
            />
            <Select
              label="Role"
              value={g.role}
              onChange={(e) => update(i, { role: e.target.value as GuardianRole })}
              options={GUARDIAN_ROLES.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[#12333F]">
              <input type="checkbox" checked={g.isPrimaryContact} onChange={(e) => update(i, { isPrimaryContact: e.target.checked })} className="rounded border-[#E5E5E5]" />
              Primary contact
            </label>
            <label className="flex items-center gap-2 text-sm text-[#12333F]">
              <input type="checkbox" checked={g.isFeeResponsible} onChange={(e) => update(i, { isFeeResponsible: e.target.checked })} className="rounded border-[#E5E5E5]" />
              Fee responsible
            </label>
            <label className="flex items-center gap-2 text-sm text-[#12333F]">
              <input type="checkbox" checked={g.isEmergencyContact} onChange={(e) => update(i, { isEmergencyContact: e.target.checked })} className="rounded border-[#E5E5E5]" />
              Emergency contact
            </label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setGuardians((rows) => [...rows, emptyGuardian()])}>
        <Plus className="w-4 h-4 mr-1.5" aria-hidden />
        Add another guardian
      </Button>
    </div>
  );
}

// ─── prior exam (PLE / UCE summary) ──────────────────────────────────────────

interface PriorExamState {
  examYear: string;
  candidateNumber: string;
  aggregate: string;
  divisionOrResult: string;
}

const emptyPriorExam: PriorExamState = {
  examYear: String(new Date().getFullYear() - 1),
  candidateNumber: '',
  aggregate: '',
  divisionOrResult: '',
};

function PriorExamFields({
  examType,
  state,
  set,
}: {
  examType: PriorExamType;
  state: PriorExamState;
  set: <K extends keyof PriorExamState>(k: K, v: string) => void;
}) {
  const results = examType === 'PLE' ? PLE_DIVISIONS : UCE_RESULTS;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        {examType === 'PLE'
          ? 'How the student did at PLE — the four subjects are graded 1–9, and the aggregate is their sum (4–36).'
          : "The student's UCE (O-Level) result summary."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Exam year" type="number" value={state.examYear} onChange={(e) => set('examYear', e.target.value)} required />
        <Input
          label={examType === 'PLE' ? 'Index number' : 'Candidate number'}
          value={state.candidateNumber}
          onChange={(e) => set('candidateNumber', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label={examType === 'PLE' ? 'Aggregate (4–36)' : 'Points / aggregate (optional)'}
          type="number"
          value={state.aggregate}
          onChange={(e) => set('aggregate', e.target.value)}
        />
        <Select
          label={examType === 'PLE' ? 'Division' : 'Result / division'}
          value={state.divisionOrResult}
          onChange={(e) => set('divisionOrResult', e.target.value)}
          options={[{ value: '', label: '—' }, ...results.map((r) => ({ value: r, label: r }))]}
        />
      </div>
    </div>
  );
}

function priorExamPayload(examType: PriorExamType, s: PriorExamState) {
  return {
    examType,
    examYear: Number(s.examYear),
    candidateNumber: trimOrNull(s.candidateNumber),
    aggregate: s.aggregate.trim() ? Number(s.aggregate) : null,
    divisionOrResult: trimOrNull(s.divisionOrResult),
    notes: null,
  };
}

// ─── edit form (identity only) ───────────────────────────────────────────────

function EditForm({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity(student));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof IdentityState>(k: K, v: IdentityState[K]) =>
    setIdentity((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson(`/api/v1/students/${student.userId}`, 'PATCH', identityPayload(identity));
    setSaving(false);
    if (res.ok) {
      toast.success('Student updated.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Identity">
        <IdentityFields identity={identity} set={set} />
      </Section>
      <div className="flex gap-2 pt-1">
        <Button type="submit" isLoading={saving}>
          Save changes
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── admission wizard ────────────────────────────────────────────────────────

type BranchKind = 'ple' | 'uce_combination' | 'o_level_optionals' | 'a_level_combination' | null;

function branchFor(cls: SchoolClass | null): BranchKind {
  if (!cls) return null;
  if (cls.stageCode === 'S1') return 'ple';
  if (cls.stageCode === 'S5') return 'uce_combination';
  return cls.stagePhase === 'A_LEVEL' ? 'a_level_combination' : 'o_level_optionals';
}

function AdmissionWizard({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity());
  const setId = <K extends keyof IdentityState>(k: K, v: IdentityState[K]) =>
    setIdentity((f) => ({ ...f, [k]: v }));

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<EntryType>('new_admission');

  const [priorExam, setPriorExam] = useState<PriorExamState>(emptyPriorExam);
  const [oLevelSubjectIds, setOLevelSubjectIds] = useState<string[]>([]);
  const [combination, setCombination] = useState<CombinationChoice>(emptyCombinationChoice);

  const [guardians, setGuardians] = useState<GuardianRow[]>(() => [emptyGuardian(true)]);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    void fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${academicYearId}`).then((list) => {
      setClasses(list);
      setClassId('');
    });
  }, [academicYearId]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!classId || !selectedClass?.hasStreams) return;
    void fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`).then((list) => {
      setStreams(list);
      setStreamId('');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const branch = branchFor(selectedClass);

  // Steps: identity, enrollment, [branch], guardians, review.
  const steps = useMemo(() => {
    const s: { key: string; label: string }[] = [
      { key: 'identity', label: 'Identity' },
      { key: 'enrollment', label: 'Enrollment' },
    ];
    if (branch === 'ple') s.push({ key: 'branch', label: 'PLE results' });
    else if (branch === 'uce_combination') s.push({ key: 'branch', label: 'UCE + combination' });
    else if (branch === 'o_level_optionals') s.push({ key: 'branch', label: 'Optional subjects' });
    else if (branch === 'a_level_combination') s.push({ key: 'branch', label: 'Combination' });
    s.push({ key: 'guardians', label: 'Guardians' });
    s.push({ key: 'review', label: 'Review' });
    return s;
  }, [branch]);

  const clampedStep = Math.min(step, steps.length - 1);
  const currentKey = steps[clampedStep].key;
  const validGuardians = guardians.filter((g) => g.firstName.trim() && g.lastName.trim());

  function canAdvance(): string | null {
    if (currentKey === 'identity') {
      if (!identity.firstName.trim() || !identity.lastName.trim()) return 'Enter the student’s first and last name.';
    }
    if (currentKey === 'enrollment') {
      if (!classId) return 'Pick a class — a student needs a class to be enrolled.';
      if (selectedClass?.hasStreams && !streamId) return 'This class has streams — pick one.';
      if (!entryDate) return 'Set an entry date.';
    }
    if (currentKey === 'branch') {
      if (branch === 'ple' && !priorExam.examYear.trim()) return 'Enter the PLE exam year.';
      if (branch === 'uce_combination') {
        if (!priorExam.examYear.trim()) return 'Enter the UCE exam year.';
        if (!combination.schoolCombinationId) return 'Pick an A-Level combination.';
      }
      if (branch === 'a_level_combination' && !combination.schoolCombinationId) return 'Pick an A-Level combination.';
    }
    if (currentKey === 'guardians' && validGuardians.length === 0) return 'Add at least one guardian.';
    return null;
  }

  function next() {
    const err = canAdvance();
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function submit() {
    const err = canAdvance();
    if (err) {
      toast.error(err);
      return;
    }
    const wantsCombination = branch === 'uce_combination' || branch === 'a_level_combination';
    const wantsPriorExam = branch === 'ple' || branch === 'uce_combination';
    const examType: PriorExamType = branch === 'ple' ? 'PLE' : 'UCE';

    setSaving(true);
    const res = await submitJson<{
      tempPassword: string;
      guardians: { firstName: string; lastName: string; matchedExisting: boolean }[];
      combination: { warnings: string[] } | null;
    }>('/api/v1/students', 'POST', {
      ...identityPayload(identity),
      enrollment: {
        academicYearId,
        classId,
        streamId: streamId || null,
        entryDate,
        entryType,
      },
      guardians: validGuardians.map((g) => ({
        newGuardian: {
          firstName: g.firstName.trim(),
          lastName: g.lastName.trim(),
          phone: trimOrNull(g.phone),
          email: trimOrNull(g.email),
          relationshipToStudent: trimOrNull(g.relationshipToStudent),
        },
        role: g.role,
        isPrimaryContact: g.isPrimaryContact,
        isFeeResponsible: g.isFeeResponsible,
        isEmergencyContact: g.isEmergencyContact,
      })),
      priorExam: wantsPriorExam ? priorExamPayload(examType, priorExam) : null,
      oLevelSubjectIds: branch === 'o_level_optionals' ? oLevelSubjectIds : null,
      combination: wantsCombination
        ? {
            schoolCombinationId: combination.schoolCombinationId,
            subsidiarySubjectId: combination.subsidiarySubjectId,
            overrideReason: combination.overrideReason,
          }
        : null,
    });
    setSaving(false);

    if (res.ok && res.data) {
      const created = res.data.guardians.filter((g) => !g.matchedExisting).length;
      const matched = res.data.guardians.filter((g) => g.matchedExisting);
      const parts: string[] = [`temp password: ${res.data.tempPassword}`];
      if (created) parts.push(`${created} new guardian${created > 1 ? 's' : ''}`);
      if (matched.length) parts.push(`linked ${matched.length} existing guardian${matched.length > 1 ? 's' : ''}`);
      const warned = res.data.combination?.warnings?.length ?? 0;
      if (warned) parts.push(`${warned} eligibility warning${warned > 1 ? 's' : ''} recorded`);
      toast.success(`Student admitted — ${parts.join('; ')}.`);
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <div className="space-y-6">
      {/* step rail */}
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-center gap-1.5 ${
              i === clampedStep ? 'text-primary-900 font-semibold' : i < clampedStep ? 'text-text-muted' : 'text-text-faint'
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                i === clampedStep ? 'bg-primary-700 text-white' : i < clampedStep ? 'bg-primary-100 text-primary-900' : 'bg-bg-muted'
              }`}
            >
              {i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      {currentKey === 'identity' && (
        <Section title="Identity">
          <IdentityFields identity={identity} set={setId} />
        </Section>
      )}

      {currentKey === 'enrollment' && (
        <Section title="Enrollment">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Academic year"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              options={years.map((y) => ({ value: y.id, label: y.yearName }))}
            />
            <Select
              label="Entry type"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as EntryType)}
              options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABEL[t] }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              options={[
                { value: '', label: classes.length ? 'Select a class…' : 'No classes set up for this year yet' },
                ...classes.map((c) => ({ value: c.id, label: c.stageName })),
              ]}
            />
            {selectedClass?.hasStreams && (
              <Select
                label="Stream"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                options={[
                  { value: '', label: streams.length ? 'Select a stream…' : 'No streams set up for this class yet' },
                  ...streams.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            )}
          </div>
          <Input label="Entry date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          {branch && (
            <p className="text-xs text-text-muted">
              {branch === 'ple' && 'Next: record the student’s PLE results.'}
              {branch === 'uce_combination' && 'Next: record UCE results and assign an A-Level combination.'}
              {branch === 'o_level_optionals' && 'Next: choose the student’s optional subjects.'}
              {branch === 'a_level_combination' && 'Next: assign an A-Level combination.'}
            </p>
          )}
        </Section>
      )}

      {currentKey === 'branch' && branch === 'ple' && (
        <Section title="PLE results">
          <PriorExamFields examType="PLE" state={priorExam} set={(k, v) => setPriorExam((s) => ({ ...s, [k]: v }))} />
        </Section>
      )}

      {currentKey === 'branch' && branch === 'uce_combination' && (
        <div className="space-y-6">
          <Section title="UCE results">
            <PriorExamFields examType="UCE" state={priorExam} set={(k, v) => setPriorExam((s) => ({ ...s, [k]: v }))} />
          </Section>
          <Section title="A-Level combination">
            <CombinationPicker academicYearId={academicYearId} value={combination} onChange={setCombination} />
          </Section>
        </div>
      )}

      {currentKey === 'branch' && branch === 'o_level_optionals' && (
        <Section title="Optional subjects">
          <OLevelOptionalsChecklist
            academicYearId={academicYearId}
            value={oLevelSubjectIds}
            onChange={setOLevelSubjectIds}
          />
        </Section>
      )}

      {currentKey === 'branch' && branch === 'a_level_combination' && (
        <Section title="A-Level combination">
          <CombinationPicker academicYearId={academicYearId} value={combination} onChange={setCombination} />
        </Section>
      )}

      {currentKey === 'guardians' && (
        <Section title="Guardians">
          <GuardiansFields guardians={guardians} setGuardians={setGuardians} />
        </Section>
      )}

      {currentKey === 'review' && (
        <Section title="Review">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-text-faint">Student</dt>
              <dd className="font-medium">
                {[identity.firstName, identity.middleName, identity.lastName].filter(Boolean).join(' ')}
              </dd>
            </div>
            <div>
              <dt className="text-text-faint">Class</dt>
              <dd className="font-medium">
                {selectedClass?.stageName}
                {selectedClass?.hasStreams && streams.find((s) => s.id === streamId)
                  ? ` · ${streams.find((s) => s.id === streamId)!.name}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-faint">Entry</dt>
              <dd className="font-medium">
                {ENTRY_TYPE_LABEL[entryType]} · {entryDate}
              </dd>
            </div>
            <div>
              <dt className="text-text-faint">Guardians</dt>
              <dd className="font-medium">{validGuardians.length}</dd>
            </div>
            {(branch === 'ple' || branch === 'uce_combination') && (
              <div>
                <dt className="text-text-faint">{branch === 'ple' ? 'PLE' : 'UCE'}</dt>
                <dd className="font-medium">
                  {priorExam.examYear}
                  {priorExam.divisionOrResult ? ` · ${priorExam.divisionOrResult}` : ''}
                  {priorExam.aggregate ? ` · agg ${priorExam.aggregate}` : ''}
                </dd>
              </div>
            )}
            {branch === 'o_level_optionals' && (
              <div>
                <dt className="text-text-faint">Subjects</dt>
                <dd className="font-medium">{oLevelSubjectIds.length} selected</dd>
              </div>
            )}
            {(branch === 'uce_combination' || branch === 'a_level_combination') && (
              <div>
                <dt className="text-text-faint">Combination</dt>
                <dd className="font-medium">{combination.schoolCombinationId ? 'Selected' : 'Not set'}</dd>
              </div>
            )}
          </dl>
        </Section>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {clampedStep > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(s - 1, 0))}>
              Back
            </Button>
          )}
          {currentKey === 'review' ? (
            <Button type="button" isLoading={saving} onClick={() => void submit()}>
              Admit student
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── entry point ─────────────────────────────────────────────────────────────

export function StudentFormModal({
  open,
  onClose,
  onSaved,
  student,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Omit to admit a new student (stepped wizard); pass to edit identity only. */
  student?: Student;
}) {
  return (
    <Modal open={open} onClose={onClose} title={student ? `Edit ${student.firstName}` : 'Admit a student'} size="lg">
      {student ? (
        <EditForm student={student} onClose={onClose} onSaved={onSaved} />
      ) : (
        <AdmissionWizard onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}
