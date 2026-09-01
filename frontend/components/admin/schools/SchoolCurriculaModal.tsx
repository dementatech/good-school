'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Plus, Star, Trash2 } from 'lucide-react';
import type { School, SchoolCurriculumRef } from './types';

interface Curriculum {
  id: string;
  code: string;
  name: string;
}

export function SchoolCurriculaModal({
  open,
  onClose,
  onSaved,
  school,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  school: School;
}) {
  const toast = useToast();
  const [attached, setAttached] = useState<SchoolCurriculumRef[]>(school.curricula);
  const [all, setAll] = useState<Curriculum[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchList<Curriculum>('/api/v1/academic/curricula');
      if (!cancelled) setAll(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const list = await fetchList<SchoolCurriculumRef>(`/api/v1/schools/${school.id}/curricula`);
    setAttached(list);
    await onSaved();
  }

  async function act(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      await refresh();
      toast.success(okMsg);
    } else {
      toast.error(res.error!);
    }
  }

  const attachedIds = new Set(attached.map((c) => c.curriculumId));
  const available = all.filter((c) => !attachedIds.has(c.id));

  return (
    <Modal open={open} onClose={onClose} title={`Curricula — ${school.name}`}>
      <div className="space-y-4">
        {attached.length === 0 ? (
          <p className="text-sm text-text-muted">No curriculum attached yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {attached.map((c) => (
              <li
                key={c.curriculumId}
                className="flex items-center justify-between text-sm py-1.5 border-b border-primary-50 last:border-0"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{c.name}</span>
                  <Badge variant="muted">{c.code}</Badge>
                  {c.isPrimary && <Badge variant="accent">Primary</Badge>}
                </span>
                <span className="flex items-center gap-3">
                  {!c.isPrimary && (
                    <button
                      type="button"
                      disabled={busy}
                      title="Make primary"
                      onClick={() =>
                        void act(
                          () =>
                            submitJson(
                              `/api/v1/schools/${school.id}/curricula/${c.curriculumId}/primary`,
                              'POST',
                            ),
                          `${c.code} is now the primary curriculum.`,
                        )
                      }
                      className="text-primary-700 hover:text-primary-700/70"
                    >
                      <Star className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    title="Remove"
                    onClick={() =>
                      void act(
                        () =>
                          submitJson(
                            `/api/v1/schools/${school.id}/curricula/${c.curriculumId}`,
                            'DELETE',
                          ),
                        `${c.code} removed.`,
                      )
                    }
                    className="text-error hover:text-error/70"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">Add a curriculum</p>
            <div className="flex flex-wrap gap-2">
              {available.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        submitJson(`/api/v1/schools/${school.id}/curricula`, 'POST', {
                          curriculumId: c.id,
                        }),
                      `${c.code} attached.`,
                    )
                  }
                >
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                  {c.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
