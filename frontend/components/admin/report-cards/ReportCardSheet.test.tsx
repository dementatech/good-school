import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentReportCardSheet, CLASSIC_DESIGN, defaultReportCardFields, type Sheet } from './ReportCardSheet';
import { DEFAULT_RULES, type ReportCardTemplate } from './templates';

const subj = (name: string, short: string, code: string, score: number | null, abs = false) => ({
  subjectId: name, subjectName: name, subjectReportName: short, paperCode: code, role: 'principal' as const, hasVariant: false,
  rawScore: score, mark: score, maxMark: 100, isAbsent: abs, computedGrade: null, isExaminable: true, points: null,
  teacherInitials: 'N.J.', history: [{ examId: 'bot', rawScore: 40, isAbsent: false }, { examId: 'mid', rawScore: score, isAbsent: abs }],
});
const sheet = (template: ReportCardTemplate | null): Sheet => ({
  student: { studentUserId: 's', studentName: 'Kiseeka Aksam', systemId: 'S262214', streamId: null, streamName: 'CENTRAL', photoUrl: null,
    attendance: null, average: 46, overallGrade: 'E', overallComment: 'Weak', principalAverage: null, principalGrade: null, principalComment: null,
    subsidiaryAverage: null, subsidiaryGrade: null, subsidiaryComment: null, aggregate: null, division: null, rank: 79,
    subjects: [subj('Biology', 'Bio', '553', 31), subj('Chemistry', 'Chem', '545', null, true)] },
  exam: { id: 'mid', name: 'Mid-Term Exams', label: 'MID', termId: 't', termName: 'Term 3', publishedAt: null },
  klass: { id: 'c', name: 'Senior 1', phase: 'O_LEVEL' }, stream: null, aggregation: null, totalInClass: 94, showPositions: true,
  fields: { ...defaultReportCardFields('SECONDARY'), ...(template?.design.fields ?? {}) }, nurseryRatings: null, mode: 'side_by_side',
  compared: [{ id: 'bot', label: 'BOT', name: 'Beginning', weightPercent: null }, { id: 'mid', label: 'MID', name: 'Mid', weightPercent: null, isCurrent: true }],
  template,
});
const bands = { primaryBands: [], nurseryBands: [], oLevelBands: [{ label: 'E', minPct: 0, maxPct: 49.99, points: null, comment: 'Weak' }], principalBands: [], subsidiaryBands: [] };
const tpl = (kind: 'styled' | 'canvas', extra = {}): ReportCardTemplate => ({ id: 'x', name: 'X', description: null, section: 'SECONDARY', kind, builtIn: false, updatedAt: null,
  design: { ...CLASSIC_DESIGN, rules: DEFAULT_RULES, ...extra } });

describe('report card render', () => {
  it('styled', () => {
    const html = renderToStaticMarkup(<StudentReportCardSheet sheet={sheet(tpl('styled', { columns: ['subjectCode','subject','scores','grade','subjectRemarks','teacherInitials','rowNumbers','points'], style: { ...CLASSIC_DESIGN.style, frame: 'none', table: 'striped' }, text: { title: 'Progress', signatures: ['A','B'], footerNote: 'Next term 2 Feb' } }))} schoolInfo={{ name: 'Central College', district: null, address: null, logoUrl: null }} {...bands} />);
    expect(html).toContain('553'); expect(html).toContain('>BIO<'); expect(html).toContain('BOT'); expect(html).toContain('Abs');
    expect(html).toContain('Next term 2 Feb'); expect(html).toContain('Progress'); expect(html.indexOf('>Code<')).toBeLessThan(html.indexOf('>#<'));
  });
  it('canvas', () => {
    const html = renderToStaticMarkup(<StudentReportCardSheet sheet={sheet(tpl('canvas', { blocks: [
      { id: 'r', type: 'results', x: 10, y: 50, w: 190, h: 60, props: {} },
      { id: 't', type: 'text', x: 10, y: 120, w: 100, h: 8, props: { text: 'Dear parent of {student}, {position}', size: 11, align: 'left', color: 'accent' } },
      { id: 'l', type: 'line', x: 10, y: 45, w: 190, h: 1, props: { thickness: 2, color: 'accent' } },
      { id: 'b', type: 'box', x: 5, y: 5, w: 200, h: 287, props: { thickness: 1, color: '#000000', fill: '', radius: 2 } },
      { id: 'h', type: 'header', x: 10, y: 8, w: 190, h: 34, props: {} },
    ] }))} schoolInfo={null} {...bands} />);
    expect(html).toContain('Dear parent of Kiseeka Aksam, 79 of 94'); expect(html).toContain('report-canvas'); expect(html).toContain('Bio');
  });
  it('no template (classic)', () => {
    const html = renderToStaticMarkup(<StudentReportCardSheet sheet={sheet(null)} schoolInfo={null} {...bands} />);
    expect(html).toContain('Report Card'); expect(html).toContain('Class Teacher');
  });
  it('fills data fields, applies show-if conditions and highlight rules', () => {
    const rules = { exams: { mode: 'opened' as const, codes: [], combine: false, weights: {} }, highlights: [{ target: 'score' as const, op: '<' as const, value: '40', color: '#C0392B', fill: '', bold: true }] };
    const html = renderToStaticMarkup(<StudentReportCardSheet sheet={sheet(tpl('canvas', { rules, blocks: [
      { id: 'r', type: 'results', x: 10, y: 50, w: 190, h: 60, props: {} },
      { id: 'f', type: 'field', x: 10, y: 120, w: 80, h: 8, props: { binding: 'learner.average', label: 'Average', labelPosition: 'left', size: 11, bold: true, align: 'left', color: '#1F2937' } },
      { id: 'yes', type: 'text', x: 10, y: 130, w: 80, h: 8, props: { text: 'Needs support', size: 11 }, showIf: { field: 'learner.average', op: '<', value: '50' } },
      { id: 'no', type: 'text', x: 10, y: 140, w: 80, h: 8, props: { text: 'Congratulations', size: 11 }, showIf: { field: 'learner.average', op: '>=', value: '80' } },
      { id: 't', type: 'text', x: 10, y: 150, w: 80, h: 8, props: { text: '{learner.name} is {learner.position}', size: 11 } },
    ] }))} schoolInfo={null} {...bands} />);
    expect(html).toContain('Average');
    expect(html).toContain('46%');
    expect(html).toContain('Needs support');
    expect(html).not.toContain('Congratulations');
    expect(html).toContain('Kiseeka Aksam is 79 of 94');
    // Biology's 31 is under 40: highlighted.
    expect(html).toMatch(/color:#C0392B;font-weight:800">31</);
  });
  it('combined report: one row per paper, marks per exam, final mark merged', () => {
    const base = sheet(null);
    const mtc = {
      ...subj('Mathematics', 'MTC', 'P458', 61.75), mark: null, hasVariant: false, variantScores: [],
      history: [
        { examId: 'mid', rawScore: 67, isAbsent: false, variantScores: [{ name: 'Practical', rawScore: 78, isAbsent: false }, { name: 'Theory', rawScore: 56, isAbsent: false }] },
        { examId: 'eot', rawScore: 56.5, isAbsent: false, variantScores: [{ name: 'Theory', rawScore: 65, isAbsent: false }, { name: 'Practical', rawScore: 48, isAbsent: false }] },
      ],
    };
    const html = renderToStaticMarkup(<StudentReportCardSheet sheet={{ ...base, mode: 'combined',
      compared: [{ id: 'mid', label: 'MID', name: 'Mid', weightPercent: 50 }, { id: 'eot', label: 'EOT', name: 'End', weightPercent: 50 }],
      student: { ...base.student, subjects: [mtc] } }} schoolInfo={null} {...bands} />);
    const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => m[1].replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'));
    const p1 = rows.find((r) => r.includes('|P1|'))!;
    const p2 = rows.find((r) => r.includes('|P2|'))!;
    // Theory is P1 in both exams even though MID listed Practical first.
    expect(p1).toMatch(/MTC\|.*P1\|56\|65\|62\|/);
    expect(p2).toBe('|P2|78|48|');
    expect(html).toContain('rowSpan="2"');
    expect(html).toContain('>Papers<');
    expect(html).not.toContain('Theory');
  });
});
