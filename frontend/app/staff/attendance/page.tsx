'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { RegisterSheet } from '@/components/attendance/RegisterSheet';
import { RegisterClassList, type RegisterClass } from '@/components/attendance/RegisterClassList';

// "Today" in East Africa Time.
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/** The class teacher's daily register. */
export default function StaffAttendancePage() {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [classes, setClasses] = useState<RegisterClass[] | null>(null);
  const [classId, setClassId] = useState('');

  const load = useCallback(async () => {
    const data = await fetchOne<{ classes: RegisterClass[] }>(`/api/v1/attendance/classes?date=${date}`, toast.error);
    setClasses(data?.classes ?? []);
    setClassId((prev) => prev || data?.classes[0]?.classId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary-700" aria-hidden />
            Class Register
          </h1>
          <p className="text-sm text-text-muted">Take the day&apos;s register for your class.</p>
        </div>
        <div className="w-44">
          <Input label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {!classes ? (
        <div className="py-12 flex justify-center">
          <Loader size={44} />
        </div>
      ) : classes.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            You aren&apos;t a class teacher this year, so there&apos;s no register for you to take.
          </p>
        </Card>
      ) : (
        <>
          {classes.length > 1 && <RegisterClassList classes={classes} selectedId={classId} onSelect={setClassId} />}
          {classId && <RegisterSheet classId={classId} date={date} onSaved={() => void load()} />}
        </>
      )}
    </div>
  );
}
