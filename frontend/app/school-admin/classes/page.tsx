'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { Layers, Plus, Trash2 } from 'lucide-react';

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
  stageName: string;
  hasStreams: boolean;
  isActive: boolean;
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
  const unopenedStages = stages.filter((s) => !openStageIds.has(s.id));

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
          The Senior classes your school runs this year, and the streams (East/West, Blue/Red)
          within each. Learners are enrolled into a stream.
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
              <div className="flex flex-wrap gap-2">
                {unopenedStages.map((s) => (
                  <Button key={s.id} variant="outline" onClick={() => void openClass(s)}>
                    <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                    {s.name}
                  </Button>
                ))}
              </div>
            </Card>
          )}

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
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-primary-700" aria-hidden />
                          <span className="font-medium text-[#12333F]">{cls.stageName}</span>
                          <Badge variant="muted">{cls.stageCode}</Badge>
                        </div>
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
