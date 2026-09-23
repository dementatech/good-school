'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { RegisterSheet } from '@/components/attendance/RegisterSheet';
import { RegisterClassList, type RegisterClass } from '@/components/attendance/RegisterClassList';

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);

interface Summary {
  from: string;
  to: string;
  classes: {
    classId: string;
    className: string;
    daysTaken: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number | null;
  }[];
  frequentAbsentees: { studentUserId: string; name: string; className: string; absences: number }[];
}

/** Every class's register for the day (and the power to take or fix one),
 * plus attendance rates over a period. */
export default function SchoolAdminAttendancePage() {
  const toast = useToast();
  const [tab, setTab] = useState<'today' | 'summary'>('today');
  const [date, setDate] = useState(today());
  const [classes, setClasses] = useState<RegisterClass[] | null>(null);
  const [classId, setClassId] = useState('');

  const load = useCallback(async () => {
    const data = await fetchOne<{ classes: RegisterClass[] }>(`/api/v1/attendance/classes?date=${date}`, toast.error);
    setClasses(data?.classes ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const taken = classes?.filter((c) => c.pupils > 0 && c.marked >= c.pupils).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-700" aria-hidden />
          Attendance
        </h1>
        <p className="text-sm text-text-muted">
          Class teachers take the register each day. You can see every class, and take or correct any register.
        </p>
      </div>

      <Tabs
        tabs={[
          { key: 'today', label: 'Registers' },
          { key: 'summary', label: 'Summary' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'today' | 'summary')}
      />

      {tab === 'summary' ? (
        <AttendanceSummary />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Input label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </div>
            {classes && classes.length > 0 && (
              <p className="text-sm text-text-muted pb-2">
                <strong className="text-primary-900">{taken}</strong> of {classes.length} registers taken.
              </p>
            )}
          </div>
          {!classes ? (
            <div className="py-12 flex justify-center">
              <Loader size={44} />
            </div>
          ) : classes.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted">No classes are open this year.</p>
            </Card>
          ) : (
            <>
              <RegisterClassList
                classes={classes}
                selectedId={classId}
                onSelect={(id) => setClassId(id === classId ? '' : id)}
              />
              {classId && <RegisterSheet classId={classId} date={date} onSaved={() => void load()} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AttendanceSummary() {
  const toast = useToast();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    void (async () => {
      setData(await fetchOne<Summary>(`/api/v1/attendance/summary?from=${from}&to=${to}`, toast.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-44">
          <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-44">
          <Input label="To" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {!data ? (
        <div className="py-10 flex justify-center">
          <Loader size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
                  <th className="py-2.5 px-4">Class</th>
                  <th className="py-2.5 px-3 text-right">Days taken</th>
                  <th className="py-2.5 px-3 text-right">Absent</th>
                  <th className="py-2.5 px-3 text-right">Late</th>
                  <th className="py-2.5 px-4 text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.classId} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-4 font-medium text-primary-900">{c.className}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{c.daysTaken}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{c.absent}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{c.late}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold">
                      {c.rate === null ? <span className="text-text-faint font-normal">—</span> : `${c.rate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <p className="text-sm font-bold text-primary-900 mb-2">Most absent</p>
            {data.frequentAbsentees.length === 0 ? (
              <p className="text-sm text-text-muted">No absences recorded in this period.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.frequentAbsentees.map((p) => (
                  <li key={p.studentUserId} className="flex items-center justify-between py-2">
                    <span>
                      <span className="block text-sm font-medium text-primary-900">{p.name}</span>
                      <span className="block text-xs text-text-faint">{p.className}</span>
                    </span>
                    <span className="text-sm font-bold text-error tabular-nums">
                      {p.absences} day{p.absences === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
