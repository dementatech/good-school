'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  MinusCircle,
  Printer,
  Upload,
  XCircle,
} from 'lucide-react';

interface ParsedRow {
  row: number;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  className: string;
  streamName: string | null;
  paymentCode: string | null;
  lin: string | null;
}

interface RowResult {
  row: number;
  name: string;
  status: 'created' | 'skipped' | 'error';
  systemId?: string;
  temporaryPassword?: string;
  note?: string;
  error?: string;
}

// Sent in batches so a large school doesn't POST one huge request — the
// backend imports each row in its own transaction regardless.
const CHUNK_SIZE = 40;

export default function StudentBulkImportPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setParsedRows(null);
    setResults([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/students/import/parse', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setParsedRows(data.data);
        toast.success(`Found ${data.data.length} row(s). Review, then start the import.`);
      } else {
        toast.error(data.error || data.message || 'Could not read the file.');
      }
    } catch {
      toast.error('Network error reading the file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsedRows) return;
    setProcessing(true);
    setResults([]);
    setProgress(0);
    const all: RowResult[] = [];

    for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
      const chunk = parsedRows.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch('/api/v1/students/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          all.push(...data.data);
        } else {
          chunk.forEach((r) =>
            all.push({
              row: r.row,
              name: `${r.firstName} ${r.lastName}`.trim(),
              status: 'error',
              error: data.error || data.message || 'Batch failed',
            }),
          );
        }
      } catch {
        chunk.forEach((r) =>
          all.push({
            row: r.row,
            name: `${r.firstName} ${r.lastName}`.trim(),
            status: 'error',
            error: 'Network error',
          }),
        );
      }
      setResults([...all]);
      setProgress(Math.min(i + CHUNK_SIZE, parsedRows.length));
    }

    setProcessing(false);
    const created = all.filter((r) => r.status === 'created').length;
    const skipped = all.filter((r) => r.status === 'skipped').length;
    const failed = all.filter((r) => r.status === 'error').length;
    toast[failed === 0 ? 'success' : 'warning'](
      `Import finished: ${created} created, ${skipped} skipped, ${failed} failed.`,
    );
  };

  const downloadResultsCsv = () => {
    const header = 'row,name,status,system_id,temporary_password,note,error';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = results.map((r) =>
      [
        r.row,
        esc(r.name),
        r.status,
        r.systemId ?? '',
        r.temporaryPassword ?? '',
        esc(r.note ?? ''),
        esc(r.error ?? ''),
      ].join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-import-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createdCount = results.filter((r) => r.status === 'created').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const noPaymentCode = results.filter(
    (r) => r.status === 'created' && (r.note ?? '').includes('payment code'),
  ).length;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/school-admin/students"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Students
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Bulk import students</h1>
        <p className="text-sm text-text-muted">
          For a school moving its existing students in. Each row creates a student account and
          enrols them in the named class for the current academic year. A login ID and temporary
          password are generated per student and only ever shown in the results below — download
          or print that list before leaving this page.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-2">1. Get the template</h2>
        <p className="text-sm text-text-muted mb-3">
          An Excel file with the columns <code>first_name</code>, <code>last_name</code>,{' '}
          <code>other_names</code>, <code>class</code>, <code>stream</code>,{' '}
          <code>payment_code</code>, <code>LIN</code>. <strong>first_name</strong>,{' '}
          <strong>last_name</strong> and <strong>class</strong> are required on every row;{' '}
          <strong>payment_code</strong> and <strong>LIN</strong> are optional but should be filled
          in wherever known. A “Reference” sheet lists this school’s current classes and streams so
          you copy the names exactly.
        </p>
        <a href="/api/v1/students/import/template">
          <Button variant="outline" inline>
            <Download className="w-4 h-4 mr-1.5" /> Download template
          </Button>
        </a>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-2">2. Upload the filled template</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setParsedRows(null);
              setResults([]);
            }}
            className="text-sm"
          />
          <Button onClick={handleParse} disabled={!file} isLoading={parsing} inline>
            <Upload className="w-4 h-4 mr-1.5" /> Check file
          </Button>
        </div>
        {parsedRows && (
          <p className="text-sm text-success mt-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {parsedRows.length} row(s) ready to import.
          </p>
        )}
      </Card>

      {parsedRows && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-3">3. Import</h2>
          <Button onClick={handleImport} isLoading={processing} disabled={processing} inline>
            Create {parsedRows.length} student account(s)
          </Button>
          {processing && (
            <div className="mt-4">
              <div className="h-2 bg-bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-700 transition-all"
                  style={{ width: `${(progress / parsedRows.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                {progress} / {parsedRows.length} processed
              </p>
            </div>
          )}
        </Card>
      )}

      {results.length > 0 && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-primary-900 flex flex-wrap items-center gap-2">
              Results
              <Badge variant="success">{createdCount} created</Badge>
              {skippedCount > 0 && <Badge variant="muted">{skippedCount} skipped</Badge>}
              {errorCount > 0 && (
                <Badge variant="muted" className="text-error">
                  {errorCount} failed
                </Badge>
              )}
            </h2>
            <div className="flex flex-col xs:flex-row gap-2 print:hidden">
              <Button variant="outline" inline onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1.5" /> Print credential slips
              </Button>
              <Button variant="outline" inline onClick={downloadResultsCsv}>
                <Download className="w-4 h-4 mr-1.5" /> Download results
              </Button>
            </div>
          </div>

          <p className="text-xs text-text-muted mb-3 print:hidden">
            Safe to re-upload the same file — a student already enrolled in that class (matched by
            name) is skipped, not duplicated.
            {noPaymentCode > 0 && (
              <>
                {' '}
                <span className="text-error">
                  {noPaymentCode} student(s) were imported without a payment code — add it from each
                  student’s page so their fee payments reconcile.
                </span>
              </>
            )}
          </p>

          {/* Printable credential slips — one per created student. */}
          <div className="hidden print:block">
            <h2 className="text-lg font-semibold mb-4">Student login credentials</h2>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              {results
                .filter((r) => r.status === 'created')
                .map((r) => (
                  <div key={r.row} className="border border-black rounded-lg p-3 break-inside-avoid">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm">
                      Student ID: <span className="font-mono">{r.systemId}</span>
                    </p>
                    <p className="text-sm">
                      Password: <span className="font-mono">{r.temporaryPassword}</span>
                    </p>
                  </div>
                ))}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1.5 print:hidden">
            {results.map((r) => (
              <div
                key={r.row}
                className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-primary-50 last:border-0"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {r.status === 'created' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : r.status === 'skipped' ? (
                    <MinusCircle className="w-3.5 h-3.5 text-text-faint shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-error shrink-0" />
                  )}
                  <span className="truncate">
                    Row {r.row}: {r.name}
                  </span>
                </span>
                <span className="text-text-muted truncate text-right">
                  {r.status === 'created'
                    ? `${r.systemId}${r.note ? ` · ${r.note}` : ''}`
                    : r.status === 'skipped'
                      ? r.note
                      : r.error}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
