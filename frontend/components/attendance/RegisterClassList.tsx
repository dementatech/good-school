'use client';

import { ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export interface RegisterClass {
  classId: string;
  className: string;
  classTeacherName: string | null;
  pupils: number;
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** A card per class with how far the day's register has got. */
export function RegisterClassList({
  classes,
  selectedId,
  onSelect,
}: {
  classes: RegisterClass[];
  selectedId: string;
  onSelect: (classId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {classes.map((c) => {
        const done = c.pupils > 0 && c.marked >= c.pupils;
        const selected = c.classId === selectedId;
        return (
          <button key={c.classId} type="button" onClick={() => onSelect(c.classId)} className="text-left">
            <Card className={`h-full transition-colors ${selected ? 'ring-2 ring-primary-700' : 'hover:border-primary-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-primary-900">{c.className}</p>
                  <p className="text-xs text-text-faint">{c.classTeacherName ?? 'No class teacher'}</p>
                </div>
                <ClipboardCheck className={`w-5 h-5 ${done ? 'text-success' : 'text-text-faint'}`} aria-hidden />
              </div>
              <p className="mt-2 text-sm">
                {c.marked === 0 ? (
                  <span className="text-warning font-medium">Not taken yet</span>
                ) : done ? (
                  <span className="text-success font-medium">Taken</span>
                ) : (
                  <span className="text-warning font-medium">
                    {c.marked} of {c.pupils} marked
                  </span>
                )}
              </p>
              {c.marked > 0 && (
                <p className="text-xs text-text-muted mt-0.5">
                  {c.present + c.late} in · {c.absent} absent
                  {c.late ? ` · ${c.late} late` : ''}
                  {c.excused ? ` · ${c.excused} excused` : ''}
                </p>
              )}
            </Card>
          </button>
        );
      })}
    </div>
  );
}
