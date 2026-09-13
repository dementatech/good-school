'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  fetchList,
  REGIME_LABEL,
  submitJson,
  type GradeRoleScope,
  type GradingAppliesTo,
  type GradingScheme,
} from './types';

export function ChangeGradeSystemModal({
  open,
  onClose,
  onSaved,
  curriculumId,
  appliesTo,
  roleScope,
  currentSchemeId,
  cardTitle,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  curriculumId: string;
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  currentSchemeId: string | null;
  /** Just for the modal title — e.g. "O-Level" or "A-Level (Subsidiary subjects)". */
  cardTitle: string;
}) {
  const toast = useToast();
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [selectedId, setSelectedId] = useState(currentSchemeId ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoading(true);
      const list = await fetchList<GradingScheme>(
        `/api/v1/academic/grading-schemes?curriculumId=${curriculumId}&appliesTo=${appliesTo}&roleScope=${roleScope}`,
      );
      setSchemes(list.filter((s) => s.isActive));
      setLoading(false);
    })();
  }, [open, curriculumId, appliesTo, roleScope]);

  const selected = schemes.find((s) => s.id === selectedId) ?? null;

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    const res = await submitJson('/api/v1/academic/school-grading-schemes', 'PUT', {
      appliesTo,
      roleScope,
      gradingSchemeId: selectedId,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Grade system updated.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Change grade system — ${cardTitle}`}>
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : schemes.length === 0 ? (
          <p className="text-sm text-text-muted">
            No active grading schemes for this track yet — ask a super-admin to add one to the catalog.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">Grade system</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="" disabled>
                  Choose a scheme…
                </option>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.id === currentSchemeId ? '(current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs text-text-muted">{REGIME_LABEL[selected.regime] ?? selected.regime}</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="pb-1 pr-2">Band</th>
                      <th className="pb-1 pr-2">Range</th>
                      <th className="pb-1 pr-2">Points</th>
                      <th className="pb-1">Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.bands.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-2 text-text-faint">
                          No bands defined yet.
                        </td>
                      </tr>
                    ) : (
                      [...selected.bands]
                        .sort((a, b) => b.minPct - a.minPct)
                        .map((b) => (
                          <tr key={b.id} className="border-t border-border/60">
                            <td className="py-1 pr-2 font-medium">{b.label}</td>
                            <td className="py-1 pr-2 tabular-nums">
                              {b.minPct}–{b.maxPct}%
                            </td>
                            <td className="py-1 pr-2">{b.points ?? <span className="text-text-faint">—</span>}</td>
                            <td className="py-1 text-text-muted">{b.comment}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={() => void save()} isLoading={saving} disabled={!selectedId || selectedId === currentSchemeId}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {selectedId === currentSchemeId && selectedId && <Badge variant="muted">Already selected</Badge>}
        </div>
      </div>
    </Modal>
  );
}
