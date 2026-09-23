'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { fetchList } from '@/lib/api/envelope';
import { LEVEL_LABEL, SCHOOL_LEVELS, offersLevel, useSchoolLevels, type SchoolLevel } from '@/lib/levels';

interface Curriculum {
  id: string;
  code: string;
  name: string;
}
interface Stage {
  id: string;
  code: string;
  name: string;
  sequenceNumber: number;
  phase: string | null;
}
interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}
interface SchoolClass {
  id: string;
  curriculumStageId: string;
  stageCode: string;
  /** The school's own name for this level ("Level 1"), else the national one. */
  stageName: string;
  stageDefaultName: string;
  stagePhase: SchoolLevel;
  hasStreams: boolean;
  classTeacherId: string | null;
  isActive: boolean;
}
interface Teacher {
  userId: string;
  firstName: string;
  lastName: string;
  activeAssignment: unknown;
}
interface Stream {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
}

export default function SchoolAdminClassesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [schoolCurricula, setSchoolCurricula] = useState<{ curriculumId: string }[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [newStream, setNewStream] = useState<Record<string, { name: string; capacity: string }>>({});
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [renaming, setRenaming] = useState<{ classId: string; name: string } | null>(null);
  const levels = useSchoolLevels();

  const currentYear = years.find((y) => y.isCurrent) ?? years[0];
  const effectiveYearId = yearId || currentYear?.id || '';

  const loadStructure = useCallback(async () => {
    if (!effectiveYearId) return;
    const [clsRes, strRes] = await Promise.all([
      fetch(`/api/v1/academic/classes?academicYearId=${effectiveYearId}`).then((r) => r.json()),
      fetch('/api/v1/academic/streams').then((r) => r.json()),
    ]);
    if (clsRes.success) setClasses(clsRes.data);
    if (strRes.success) setStreams(strRes.data);
  }, [effectiveYearId]);

  useEffect(() => {
    (async () => {
      try {
        const [yearsRes, curRes, scRes] = await Promise.all([
          fetch('/api/v1/academic/years').then((r) => r.json()),
          fetch('/api/v1/academic/curricula').then((r) => r.json()),
          fetch('/api/v1/academic/school-curricula').then((r) => r.json()),
        ]);
        void fetchList<Teacher>('/api/v1/staff', toast.error).then((list) =>
          setTeachers(list.filter((t) => t.activeAssignment)),
        );
        if (yearsRes.success) setYears(yearsRes.data);
        if (curRes.success) setCurricula(curRes.data);
        if (scRes.success) setSchoolCurricula(scRes.data);
        const firstCurriculumId = scRes.success && scRes.data[0]?.curriculumId;
        if (firstCurriculumId) {
          const stRes = await fetch(
            `/api/v1/academic/stages?curriculumId=${firstCurriculumId}`,
          ).then((r) => r.json());
          if (stRes.success) setStages(stRes.data);
        }
      } catch {
        toast.error('Network error loading academic structure.');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadStructure();
    })();
    return () => controller.abort();
  }, [loadStructure]);

  async function optIn(curriculumId: string) {
    const res = await fetch('/api/v1/academic/school-curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculumId }),
    });
    const data = await res.json();
    if (data.success) {
      setSchoolCurricula(data.data);
      const stRes = await fetch(`/api/v1/academic/stages?curriculumId=${curriculumId}`).then((r) =>
        r.json(),
      );
      if (stRes.success) setStages(stRes.data);
      toast.success('Curriculum added.');
    } else {
      toast.error(data.error ?? 'Could not add curriculum.');
    }
  }

  async function openClass(stage: Stage) {
    const res = await fetch('/api/v1/academic/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicYearId: effectiveYearId,
        curriculumStageId: stage.id,
        hasStreams: true,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`${stage.name} opened for ${currentYear?.yearName}.`);
      await loadStructure();
    } else {
      toast.error(data.error ?? 'Could not open the class.');
    }
  }

  // Kindergarten progress (and each class's report remarks) is written by
  // this person — see the early-years module.
  async function setClassTeacher(cls: SchoolClass, classTeacherId: string | null) {
    const res = await fetch(`/api/v1/academic/classes/${cls.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicYearId: effectiveYearId,
        curriculumStageId: cls.curriculumStageId,
        hasStreams: cls.hasStreams,
        classTeacherId,
        isActive: cls.isActive,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`Class teacher updated for ${cls.stageName}.`);
      await loadStructure();
    } else {
      toast.error(data.error ?? 'Could not update the class teacher.');
    }
  }

  // The school's own name for a class level — "Level 1" for Primary 1. It's
  // per level, so it carries into every academic year. Blank = national name.
  async function renameClass(cls: SchoolClass, name: string) {
    const res = await fetch('/api/v1/academic/stage-labels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculumStageId: cls.curriculumStageId, name: name.trim() || null }),
    });
    const data = await res.json();
    if (data.success) {
      setRenaming(null);
      toast.success(name.trim() ? `Renamed to ${name.trim()}.` : `Back to ${cls.stageDefaultName}.`);
      await loadStructure();
    } else {
      toast.error(data.error ?? 'Could not rename the class.');
    }
  }

  async function removeClass(cls: SchoolClass) {
    if (!confirm(`Remove ${cls.stageName} for this year? Its streams go too.`)) return;
    const res = await fetch(`/api/v1/academic/classes/${cls.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadStructure();
    } else {
      toast.error(data.error ?? 'Could not remove the class.');
    }
  }

  async function addStream(cls: SchoolClass) {
    const draft = newStream[cls.id];
    if (!draft?.name.trim()) return;
    const res = await fetch('/api/v1/academic/streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: cls.id,
        name: draft.name.trim(),
        capacity: draft.capacity ? Number(draft.capacity) : null,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setNewStream((s) => ({ ...s, [cls.id]: { name: '', capacity: '' } }));
      await loadStructure();
    } else {
      toast.error(data.error ?? 'Could not add the stream.');
    }
  }

  async function removeStream(stream: Stream) {
    const res = await fetch(`/api/v1/academic/streams/${stream.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) await loadStructure();
    else toast.error(data.error ?? 'Could not delete the stream.');
  }

  const openStageIds = new Set(classes.map((c) => c.curriculumStageId));
  // Only the levels this school runs (all of them until its flags load).
  const unopenedStages = stages.filter(
    (s) => !openStageIds.has(s.id) && !!levels && (!s.phase || offersLevel(levels, s.phase as SchoolLevel)),
  );
  const unopenedByLevel = SCHOOL_LEVELS.map((level) => ({
    level,
    stages: unopenedStages.filter((s) => s.phase === level),
  })).filter((g) => g.stages.length > 0);
  const otherUnopened = unopenedStages.filter((s) => !SCHOOL_LEVELS.includes(s.phase as SchoolLevel));

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Classes &amp; Streams</h1>
        <p className="text-sm text-text-muted">
          {levels && (levels.offersKindergarten || levels.offersPrimary)
            ? 'The classes your school runs this year, and the streams (Red/Blue, East/West) within each. Pupils are enrolled into a stream.'
            : 'The Senior classes your school runs this year, and the streams (East/West, Blue/Red) within each. Learners are enrolled into a stream.'}
        </p>
      </div>

      {schoolCurricula.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary mb-3">
            Your school hasn&apos;t been assigned a curriculum yet.
          </p>
          <div className="flex flex-wrap gap-2">
            {curricula.map((c) => (
              <Button key={c.id} variant="outline" onClick={() => void optIn(c.id)}>
                <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                {c.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {years.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            Create an academic year first (Academic Years &amp; Terms).
          </p>
        </Card>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">
              Academic year
            </label>
            <select
              value={effectiveYearId}
              onChange={(e) => setYearId(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.yearName}
                  {y.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {unopenedStages.length > 0 && schoolCurricula.length > 0 && (
            <Card>
              <p className="text-sm font-medium text-primary-900 mb-2">Open a class for this year</p>
              <div className="space-y-3">
                {[...unopenedByLevel, ...(otherUnopened.length ? [{ level: null, stages: otherUnopened }] : [])].map(
                  (group) => (
                    <div key={group.level ?? 'other'}>
                      {unopenedByLevel.length > 1 && (
                        <p className="text-xs font-medium text-text-muted mb-1.5">
                          {group.level ? LEVEL_LABEL[group.level] : 'Other'}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {group.stages.map((s) => (
                          <Button key={s.id} variant="outline" onClick={() => void openClass(s)}>
                            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                            {s.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </Card>
          )}

          {classes.length > 1 && <BulkStreams classes={classes} onDone={loadStructure} />}

          <Card>
            {classes.length === 0 ? (
              <p className="text-sm text-text-muted">No classes opened for this year yet.</p>
            ) : (
              <div className="space-y-3">
                {classes.map((cls) => {
                  const clsStreams = streams.filter((s) => s.classId === cls.id);
                  const draft = newStream[cls.id] ?? { name: '', capacity: '' };
                  return (
                    <div key={cls.id} className="rounded-xl border border-[#EAEAEA] p-3">
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        {renaming?.classId === cls.id ? (
                          <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void renameClass(cls, renaming.name);
                            }}
                          >
                            <Layers className="w-4 h-4 text-primary-700" aria-hidden />
                            <input
                              autoFocus
                              // Typing replaces the old name rather than adding to it.
                              onFocus={(e) => e.target.select()}
                              value={renaming.name}
                              onChange={(e) => setRenaming({ classId: cls.id, name: e.target.value })}
                              placeholder={cls.stageDefaultName}
                              maxLength={40}
                              aria-label="Class name"
                              className="border border-border rounded-lg px-2 py-1 text-sm w-44"
                            />
                            <Button inline type="submit">
                              Save
                            </Button>
                            <Button inline type="button" variant="ghost" onClick={() => setRenaming(null)}>
                              Cancel
                            </Button>
                            <span className="text-xs text-text-faint">
                              Used everywhere, every year. Leave blank for &ldquo;{cls.stageDefaultName}&rdquo;.
                            </span>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary-700" aria-hidden />
                            <span className="font-medium text-[#12333F]">{cls.stageName}</span>
                            {cls.stageName !== cls.stageDefaultName ? (
                              <span className="text-xs text-text-faint">({cls.stageDefaultName})</span>
                            ) : (
                              <Badge variant="muted">{cls.stageCode}</Badge>
                            )}
                            <button
                              type="button"
                              onClick={() => setRenaming({ classId: cls.id, name: cls.stageName })}
                              title="Rename this class"
                              aria-label={`Rename ${cls.stageName}`}
                              className="text-text-faint hover:text-primary-700"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden />
                            </button>
                          </div>
                        )}
                        <label className="ml-auto flex items-center gap-2 text-xs text-text-muted">
                          Class teacher
                          <select
                            value={cls.classTeacherId ?? ''}
                            onChange={(e) => void setClassTeacher(cls, e.target.value || null)}
                            className="border border-border rounded-lg px-2 py-1 text-xs text-[#12333F] max-w-[12rem]"
                          >
                            <option value="">Not assigned</option>
                            {teachers.map((t) => (
                              <option key={t.userId} value={t.userId}>
                                {t.firstName} {t.lastName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void removeClass(cls)}
                          title="Remove class"
                          className="text-error hover:text-error/70"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {clsStreams.map((stream) => (
                          <span
                            key={stream.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAFAFA] px-2 py-1 text-xs text-[#12333F]"
                          >
                            {stream.name}
                            {stream.capacity != null && (
                              <span className="text-text-faint">· {stream.capacity}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => void removeStream(stream)}
                              aria-label={`Delete ${stream.name}`}
                              className="text-text-faint hover:text-error"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="w-32">
                          <Input
                            label="Stream name"
                            placeholder="East"
                            value={draft.name}
                            onChange={(e) =>
                              setNewStream((s) => ({
                                ...s,
                                [cls.id]: { ...draft, name: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="w-24">
                          <Input
                            label="Capacity"
                            type="number"
                            placeholder="45"
                            value={draft.capacity}
                            onChange={(e) =>
                              setNewStream((s) => ({
                                ...s,
                                [cls.id]: { ...draft, capacity: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <Button variant="outline" onClick={() => void addStream(cls)}>
                          Add stream
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * The same streams in several classes at once — type "East, West" once, tick
 * the classes, done. A class that already has a stream of that name keeps it.
 */
function BulkStreams({ classes, onDone }: { classes: SchoolClass[]; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [names, setNames] = useState('');
  const [capacity, setCapacity] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const nameList = names
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const allPicked = picked.size === classes.length;

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function create() {
    setSaving(true);
    const res = await fetch('/api/v1/academic/streams/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classIds: [...picked],
        names: nameList,
        capacity: capacity ? Number(capacity) : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) {
      toast.error(data.error ?? 'Could not add the streams.');
      return;
    }
    const { created, skipped } = data.data as { created: number; skipped: number };
    toast.success(
      `Added ${created} stream${created === 1 ? '' : 's'}` +
        (skipped ? ` (${skipped} already existed)` : '') +
        '.',
    );
    setNames('');
    setCapacity('');
    setPicked(new Set());
    await onDone();
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-medium text-primary-900">Add streams to several classes</p>
        <p className="text-xs text-text-muted">
          Type the stream names once — separated by commas — and pick the classes that should have them.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[14rem]">
          <Input
            label="Stream names"
            placeholder="East, West"
            value={names}
            onChange={(e) => setNames(e.target.value)}
          />
        </div>
        <div className="w-28">
          <Input
            label="Capacity (each)"
            type="number"
            placeholder="45"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-[#12333F]">
          <input
            type="checkbox"
            checked={allPicked}
            onChange={() => setPicked(allPicked ? new Set() : new Set(classes.map((c) => c.id)))}
            className="rounded border-[#E5E5E5]"
          />
          All classes
        </label>
        {classes.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-sm text-[#12333F]">
            <input
              type="checkbox"
              checked={picked.has(c.id)}
              onChange={() => toggle(c.id)}
              className="rounded border-[#E5E5E5]"
            />
            {c.stageName}
          </label>
        ))}
      </div>
      <Button
        inline
        onClick={() => void create()}
        isLoading={saving}
        disabled={nameList.length === 0 || picked.size === 0}
      >
        <Plus className="w-4 h-4 mr-1.5" aria-hidden />
        {nameList.length && picked.size
          ? `Add ${nameList.length} stream${nameList.length === 1 ? '' : 's'} to ${picked.size} class${picked.size === 1 ? '' : 'es'}`
          : 'Add streams'}
      </Button>
    </Card>
  );
}
