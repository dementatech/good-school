import type { Metadata } from 'next';
import { DEFAULT_AVATAR } from '@/lib/avatar/default';

export const metadata: Metadata = {
  title: 'Report card sample — Seeta High School',
  description: 'A sample Seeta High School summative assessment report card, filled with fictional learner data.',
};

/**
 * Public sample of Seeta High School's summative assessment report card,
 * shown with the school's approval. The school's name, crest and contacts are
 * real; the learner, marks and teachers are FICTIONAL, so the page never
 * exposes a real learner's details.
 */

const SCHOOL = {
  name: 'SEETA HIGH SCHOOL',
  contact: 'P. O. Box 417,  Tel: 041-471437  KAMPALA',
  title: 'SUMMATIVE ASSESSMENT REPORT',
  exam: 'End of Term 2 Exams - 2025',
};

const LEARNER = {
  name: 'MIREMBE PROMISE',
  payCode: '1000000001',
  className: 'S2 N',
  studentNo: '10001',
};

// [subject, first 15% assessment, second 15% assessment, 70% exam, teacher initials]
const MARKS: [string, number, number, number, string][] = [
  ['Biology', 12, 11, 52, 'E.K.'],
  ['Chemistry', 10, 9, 50, 'F.K.'],
  ['Mathematics', 13, 12, 55, 'M.S.'],
  ['Physics', 9, 10, 48, 'N.E.'],
  ['English Language', 14, 13, 58, 'C.B.'],
  ['History', 11, 12, 51, 'D.K.'],
  ['Geography', 12, 10, 47, 'M.N.'],
  ['Christian Rel. Educ.', 13, 12, 53, 'J.N.'],
  ['Kiswahili', 14, 13, 62, 'P.N.'],
  ['Entrepreneurship', 11, 9, 46, 'A.N.'],
  ['Computer Studies', 12, 11, 44, 'E.N.'],
  ['Physical Education', 14, 13, 57, 'B.J.K.'],
  ['French Lang', 9, 8, 33, 'M.A.'],
  ['Luganda', 13, 12, 61, 'V.N.'],
];

const SCHEME: { min: number; grade: string; label: string }[] = [
  { min: 80, grade: 'A', label: '80+' },
  { min: 70, grade: 'B', label: '70-79' },
  { min: 60, grade: 'C', label: '60-69' },
  { min: 50, grade: 'D', label: '50-59' },
  { min: 0, grade: 'E', label: '0 -49' },
];

const COMMENT: Record<string, string> = {
  A: 'Very good mark. Keep it up.',
  B: 'Promising performance aim higher.',
  C: 'Aim at higher scores because you are capable.',
  D: 'Fair performance. Aim higher.',
  E: 'Read harder and consult teachers for better grades.',
};

const gradeOf = (mark: number) => SCHEME.find((s) => mark >= s.min)!.grade;

const ROWS = MARKS.map(([subject, a, b, c, initials]) => {
  const total = a + b + c;
  const grade = gradeOf(total);
  return { subject, a, b, c, total, grade, comment: COMMENT[grade], initials };
});
const TOTAL = ROWS.reduce((sum, r) => sum + r.total, 0);
const AVERAGE = Math.round((TOTAL / ROWS.length) * 10) / 10;
const AVERAGE_GRADE = gradeOf(AVERAGE);

const cell = 'border border-black px-1 leading-tight';

export default function ReportSamplesPage() {
  return (
    <div className="min-h-screen bg-[#e9eef2] py-6 print:bg-white print:py-0">
      {/* Landscape, like the original paper report. */}
      <style>{`
        @page sample { size: A4 landscape; margin: 8mm; }
        @media print { .report-sample { page: sample; box-shadow: none !important; } }
      `}</style>

      <div
        className="report-sample mx-auto bg-white shadow-lg text-black"
        style={{ width: '281mm', padding: '4mm 9mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        {/* Header: crest, school details, photo */}
        <div className="flex items-start justify-between" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
          <div className="flex items-start" style={{ width: '34mm' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/report-samples/seeta-crest.png" alt="Seeta High School crest" style={{ width: '28mm', height: 'auto' }} />
          </div>

          <div className="flex-1 text-center">
            <p className="text-[22px] font-bold tracking-wide text-[#1d4f91]">{SCHOOL.name}</p>
            <p className="text-[12px] font-bold">{SCHOOL.contact}</p>
            <p className="mx-auto mt-2 inline-block border border-black px-12 py-0.5 text-[12px] font-bold">{SCHOOL.title}</p>
            <p className="mt-1 text-[16px] font-bold">{SCHOOL.exam}</p>
          </div>

          <div className="flex justify-end" style={{ width: '34mm' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEFAULT_AVATAR} alt="" style={{ width: '20mm', height: '24mm', objectFit: 'cover' }} />
          </div>
        </div>

        {/* Learner line */}
        <div className="mt-1 flex items-end justify-between text-[12px]">
          <div>
            <p className="text-[13px] font-bold">Name:&nbsp; {LEARNER.name}</p>
            <p>SchPay Code:&nbsp;&nbsp; {LEARNER.payCode}</p>
          </div>
          <div className="text-center">
            <p className="text-[13px] font-bold">Class: {LEARNER.className}</p>
            <p>Student No: {LEARNER.studentNo}</p>
          </div>
          <p className="font-bold">Average Grade: {AVERAGE_GRADE}</p>
        </div>

        {/* Marks table */}
        <table className="mx-auto mt-1 border-collapse text-[10px]" style={{ width: '228mm' }}>
          <thead>
            <tr className="text-[9px]">
              <th className={`${cell} font-normal`} rowSpan={2} />
              <th className={cell} colSpan={4}>
                SUMMATIVE ASSESSMENT
              </th>
              <th className={cell} colSpan={2}>
                TERM AVERAGE
              </th>
              <th className={cell} rowSpan={2} style={{ width: '82mm' }}>
                TEACHER COMMENTS
              </th>
              <th className={cell} rowSpan={2}>
                TEACHER
                <br />
                INITIALS
              </th>
            </tr>
            <tr className="font-normal">
              <th className={`${cell} font-normal text-[9px] align-bottom`}>15%</th>
              <th className={`${cell} font-normal align-bottom`}>15%</th>
              <th className={`${cell} font-normal align-bottom`}>70%</th>
              <th className={`${cell} font-normal text-right align-top`}>Total</th>
              <th className={`${cell} font-normal text-left`}>
                Total
                <br />
                Mark
              </th>
              <th className={`${cell} font-normal align-bottom`}>Grade</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${cell} text-center`} style={{ width: '40mm' }}>
                Subjects
              </td>
              <td className={cell} colSpan={8} />
            </tr>
            {ROWS.map((r) => (
              <tr key={r.subject}>
                <td className={cell}>{r.subject}</td>
                <td className={`${cell} text-center`}>{r.a}</td>
                <td className={`${cell} text-center`}>{r.b}</td>
                <td className={`${cell} text-center`}>{r.c}</td>
                <td className={`${cell} text-right`}>{r.total}</td>
                <td className={`${cell} text-right`}>{r.total}</td>
                <td className={`${cell} text-center`}>{r.grade}</td>
                <td className={cell}>{r.comment}</td>
                <td className={`${cell} text-center`}>{r.initials}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className={cell}>TOTAL</td>
              <td className={cell} colSpan={4} />
              <td className={`${cell} text-center`}>{TOTAL.toFixed(1)}</td>
              <td className={cell} colSpan={3} />
            </tr>
            <tr className="font-bold">
              <td className={cell}>AVERAGE</td>
              <td className={cell} colSpan={4} />
              <td className={`${cell} text-center`}>{AVERAGE.toFixed(1)}</td>
              <td className={cell} colSpan={3} />
            </tr>
          </tbody>
        </table>

        {/* Grading scheme */}
        <div className="mt-1.5 flex justify-center text-[11px] font-bold" style={{ paddingLeft: '40mm' }}>
          <div>
            <p className="underline">Grading scheme:</p>
            <div className="grid grid-cols-2 gap-x-6">
              {SCHEME.slice(0, 3).map((s, i) => (
                <p key={s.grade} className="contents">
                  <span>
                    {s.label}&nbsp;&nbsp; {s.grade}
                  </span>
                  <span>{SCHEME[i + 3] ? `${SCHEME[i + 3].label}  ${SCHEME[i + 3].grade}` : ''}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Remarks */}
        <p className="text-right text-[8px] italic" style={{ marginRight: '45mm' }}>
          Signatures
        </p>
        <table className="mx-auto border-collapse text-[11px]" style={{ width: '228mm' }}>
          <tbody>
            <tr>
              <td className={`${cell} py-1 font-bold`} style={{ width: '40mm' }}>
                Class Teacher
                <br />
                <span className="font-normal">Mukasa Daniel</span>
              </td>
              <td className={`${cell} py-1`}>This is a good performance, aim higher for better results.</td>
              <td className={cell} style={{ width: '40mm' }} />
            </tr>
            <tr>
              <td className={`${cell} py-2 font-bold`}>Headteacher</td>
              <td className={`${cell} py-2`}>A promising performance, Mirembe should aim at 80% average.</td>
              <td className={cell} />
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="mx-auto mt-1 flex items-start justify-between text-[11px]" style={{ width: '228mm' }}>
          <div className="flex-1">
            <p className="font-bold">Start of Next Term: 20 September 2025</p>
            <div className="mt-0.5 border border-black px-1.5 py-1" style={{ width: '125mm' }}>
              <p className="font-bold">Requirements for next term:</p>
              <p>1 Ream rotatrim and 1 scrubbing brush</p>
              <p>1 Tin of jik (medium size) and 1 Bottle of Harpic.</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <p className="italic">Date of Issue: 22 August 2025</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/report-samples/seeta-stamp.png"
              alt="Seeta High School stamp"
              className="mt-1 -rotate-6"
              style={{ width: '46mm', height: 'auto', opacity: 0.9 }}
            />
          </div>
        </div>

        <p className="mt-2 text-center text-[8px] text-[#555] print:hidden">
          Sample report card. All names, marks and school details are fictional.
        </p>
      </div>
    </div>
  );
}
