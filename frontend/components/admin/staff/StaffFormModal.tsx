'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import type { CatalogSubject } from '@/components/admin/subjects/types';
import {
  EMPLOYMENT_BASIS_LABEL,
  EMPLOYMENT_BASES,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_TYPES,
  ENTRY_TYPE_LABEL,
  ENTRY_TYPES,
  GENDERS,
  QUALIFICATIONS,
  ROLES_FOR_CATEGORY,
  STAFF_CATEGORIES,
  STAFF_CATEGORY_LABEL,
  STAFF_ROLE_LABEL,
  TMIS_STATUS_LABEL,
  TMIS_STATUSES,
  type AcademicYear,
  type AssignmentEntryType,
  type EmploymentBasis,
  type EmploymentType,
  type Gender,
  type Staff,
  type StaffCategory,
  type StaffRole,
  type TmisStatus,
} from './types';

/** Which class levels this person teaches — purely a UI filter on the
 * specialization picker below, not a stored field: the real, class-specific
 * "what do they actually teach" fact lives in subject_teacher_assignment
 * (assigned later, per subject, from the Subjects & Combinations page). */
type TeachingLevel = 'O_LEVEL' | 'A_LEVEL' | 'both';

const TEACHING_LEVEL_LABEL: Record<TeachingLevel, string> = {
  O_LEVEL: 'O-Level only',
  A_LEVEL: 'A-Level only',
  both: 'Both O-Level and A-Level',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

type IdentityState = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | '';
  tmisNumber: string;
  tmisStatus: TmisStatus;
  qualification: string;
  qualificationOther: string;
  employmentType: EmploymentType;
  employmentBasis: EmploymentBasis | '';
  email: string;
  phoneNumber: string;
};

// A qualification on file that isn't one of the dropdown's known values is
// itself the "Other" choice, with its actual text preserved rather than
// discarded — this only happens editing an existing record created before
// the dropdown existed, or one where "Other" was picked.
function initialIdentity(s?: Staff): IdentityState {
  const knownQualification = s?.qualification && QUALIFICATIONS.includes(s.qualification as (typeof QUALIFICATIONS)[number]);
  return {
    firstName: s?.firstName ?? '',
    middleName: s?.middleName ?? '',
    lastName: s?.lastName ?? '',
    dateOfBirth: s?.dateOfBirth ?? '',
    gender: s?.gender ?? '',
    tmisNumber: s?.tmisNumber ?? '',
    tmisStatus: s?.tmisStatus ?? 'not_registered',
    qualification: s?.qualification ? (knownQualification ? s.qualification : 'Other') : '',
    qualificationOther: s?.qualification && !knownQualification ? s.qualification : '',
    employmentType: s?.employmentType ?? 'government',
    employmentBasis: s?.employmentBasis ?? '',
    email: s?.email ?? '',
    phoneNumber: s?.phoneNumber ?? '',
  };
}

export function StaffFormModal({
  open,
  onClose,
  onSaved,
  staff,
  defaultCategory = 'teaching',
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Omit to hire a new staff member; pass to edit identity fields only
   * (the school assignment is managed separately once a staff record
   * exists — see the "Assignments" tab on the detail view). */
  staff?: Staff;
  /** Which category tab the admin was on when they clicked "Hire" — just a
   * sensible starting point, freely changeable in the form itself. */
  defaultCategory?: StaffCategory;
}) {
  const toast = useToast();
  const isEdit = Boolean(staff);
  const [category, setCategory] = useState<StaffCategory>(staff?.category ?? defaultCategory);
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity(staff));
  const set = <K extends keyof IdentityState>(k: K, v: IdentityState[K]) =>
    setIdentity((f) => ({ ...f, [k]: v }));

  // Assignment — only asked at hire time. A staff member without one isn't
  // meaningfully working at this school yet (teachers-module.md §2). Role
  // options narrow to whatever's sensible for the chosen category — picking
  // a category resets role to that list's first entry, since a category
  // switch can leave a previously-valid role no longer offered.
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [role, setRole] = useState<StaffRole>(ROLES_FOR_CATEGORY[staff?.category ?? defaultCategory][0]);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<AssignmentEntryType>('new_hire');

  function changeCategory(next: StaffCategory) {
    setCategory(next);
    setRole(ROLES_FOR_CATEGORY[next][0]);
  }

  // Specializations — which subjects this person is qualified to teach
  // (§3), NOT which specific classes they actually teach right now (that's
  // subject_teacher_assignment, set later per class/stream from the
  // Subjects & Combinations page). Optional at intake; can also be changed
  // later from the staff detail view.
  const [teachingLevel, setTeachingLevel] = useState<TeachingLevel>('O_LEVEL');
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [specializationIds, setSpecializationIds] = useState<string[]>(
    () => staff?.specializations.map((s) => s.subjectId) ?? [],
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) return;
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);

      const schoolCurricula = await fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula');
      const curriculumId = schoolCurricula[0]?.curriculumId;
      if (curriculumId) {
        setSubjects(await fetchList<CatalogSubject>(`/api/v1/academic/subjects?curriculumId=${curriculumId}`));
      }
    })();
  }, [isEdit]);

  function toggleSpecialization(subjectId: string) {
    setSpecializationIds((ids) =>
      ids.includes(subjectId) ? ids.filter((id) => id !== subjectId) : [...ids, subjectId],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trim = (v: string) => v.trim() || null;
    const qualification =
      identity.qualification === 'Other' ? trim(identity.qualificationOther) : trim(identity.qualification);

    if (isEdit) {
      setSaving(true);
      const res = await submitJson(`/api/v1/staff/${staff!.userId}`, 'PATCH', {
        category,
        firstName: identity.firstName.trim(),
        middleName: trim(identity.middleName),
        lastName: identity.lastName.trim(),
        dateOfBirth: trim(identity.dateOfBirth),
        gender: identity.gender || null,
        tmisNumber: trim(identity.tmisNumber),
        tmisStatus: identity.tmisStatus,
        qualification,
        employmentType: identity.employmentType,
        employmentBasis: identity.employmentBasis || null,
        email: trim(identity.email),
        phoneNumber: trim(identity.phoneNumber),
      });
      setSaving(false);
      if (res.ok) {
        toast.success('Staff record updated.');
        await onSaved();
        onClose();
      } else {
        toast.error(res.error!);
      }
      return;
    }

    if (!academicYearId) {
      toast.error('Pick an academic year — a staff member needs a starting assignment.');
      return;
    }

    setSaving(true);
    const res = await submitJson<{ staff: Staff; tempPassword: string }>('/api/v1/staff', 'POST', {
      category,
      firstName: identity.firstName.trim(),
      middleName: trim(identity.middleName),
      lastName: identity.lastName.trim(),
      dateOfBirth: trim(identity.dateOfBirth),
      gender: identity.gender || null,
      tmisNumber: trim(identity.tmisNumber),
      tmisStatus: identity.tmisStatus,
      qualification,
      employmentType: identity.employmentType,
      employmentBasis: identity.employmentBasis || null,
      email: trim(identity.email),
      phoneNumber: trim(identity.phoneNumber),
      assignment: { academicYearId, role, entryDate, entryType },
      specializationSubjectIds: specializationIds,
    });
    setSaving(false);
    if (res.ok && res.data) {
      toast.success(`Staff hired — temp password: ${res.data.tempPassword}.`);
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${staff!.firstName}` : 'Hire a staff member'} size="lg">
      <form onSubmit={submit} className="space-y-6">
        <Section title="Category">
          <Select
            label="What kind of staff member is this?"
            value={category}
            onChange={(e) => changeCategory(e.target.value as StaffCategory)}
            options={STAFF_CATEGORIES.map((c) => ({ value: c, label: STAFF_CATEGORY_LABEL[c] }))}
          />
        </Section>

        <Section title="Identity">
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
              label="TMIS number"
              value={identity.tmisNumber}
              onChange={(e) => set('tmisNumber', e.target.value)}
              placeholder="Leave blank if not yet registered"
            />
            <Select
              label="TMIS status"
              value={identity.tmisStatus}
              onChange={(e) => set('tmisStatus', e.target.value as TmisStatus)}
              options={TMIS_STATUSES.map((s) => ({ value: s, label: TMIS_STATUS_LABEL[s] }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Qualification"
              value={identity.qualification}
              onChange={(e) => set('qualification', e.target.value)}
              options={[{ value: '', label: '—' }, ...QUALIFICATIONS.map((q) => ({ value: q, label: q }))]}
            />
            {identity.qualification === 'Other' && (
              <Input
                label="Specify qualification"
                value={identity.qualificationOther}
                onChange={(e) => set('qualificationOther', e.target.value)}
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Employment type"
              value={identity.employmentType}
              onChange={(e) => set('employmentType', e.target.value as EmploymentType)}
              options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABEL[t] }))}
            />
            <Select
              label="Employment basis"
              value={identity.employmentBasis}
              onChange={(e) => set('employmentBasis', e.target.value as EmploymentBasis | '')}
              options={[{ value: '', label: '—' }, ...EMPLOYMENT_BASES.map((b) => ({ value: b, label: EMPLOYMENT_BASIS_LABEL[b] }))]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Email (optional)" type="email" value={identity.email} onChange={(e) => set('email', e.target.value)} />
            <Input label="Phone (optional)" value={identity.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} />
          </div>
        </Section>

        {!isEdit && (
          <>
            <Section title="School assignment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Academic year"
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                  options={years.map((y) => ({ value: y.id, label: y.yearName }))}
                />
                <Select
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  options={ROLES_FOR_CATEGORY[category].map((r) => ({ value: r, label: STAFF_ROLE_LABEL[r] }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Entry type"
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as AssignmentEntryType)}
                  options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABEL[t] }))}
                />
                <Input label="Entry date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
              </div>
            </Section>

            {category === 'teaching' && (
            <Section title="Subject specializations (optional)">
              <p className="text-xs text-text-muted -mt-1">
                Which subjects this person is <em>qualified</em> to teach — a hint for the candidate list
                when allocating a subject to a teacher later, not an assignment itself. It doesn&apos;t
                put them in front of any class; which specific classes they actually teach (e.g. Biology
                in only S2 and S4) is set separately, per class/stream, from the Subjects &amp;
                Combinations page — and can be changed any time regardless of what&apos;s ticked here.
              </p>
              <Select
                label="Teaches which level(s)?"
                value={teachingLevel}
                onChange={(e) => setTeachingLevel(e.target.value as TeachingLevel)}
                options={(['O_LEVEL', 'A_LEVEL', 'both'] as const).map((l) => ({
                  value: l,
                  label: TEACHING_LEVEL_LABEL[l],
                }))}
              />
              {(['O_LEVEL', 'A_LEVEL'] as const)
                .filter((phase) => teachingLevel === 'both' || teachingLevel === phase)
                .map((phase) => {
                  const phaseSubjects = subjects.filter((s) => s.phase === phase);
                  return (
                    <div key={phase} className="space-y-1.5">
                      {teachingLevel === 'both' && (
                        <h4 className="text-xs font-medium text-text-faint">
                          {phase === 'O_LEVEL' ? 'O-Level' : 'A-Level'}
                        </h4>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-40 overflow-y-auto pr-1">
                        {phaseSubjects.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm text-[#12333F]">
                            <input
                              type="checkbox"
                              checked={specializationIds.includes(s.id)}
                              onChange={() => toggleSpecialization(s.id)}
                              className="rounded border-[#E5E5E5]"
                            />
                            {s.name}
                          </label>
                        ))}
                        {phaseSubjects.length === 0 && (
                          <span className="text-xs text-text-faint">
                            No {phase === 'O_LEVEL' ? 'O-Level' : 'A-Level'} subjects in the catalog yet.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </Section>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {isEdit ? 'Save changes' : 'Hire staff member'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
