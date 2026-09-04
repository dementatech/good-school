'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { FileText, Trash2, Upload } from 'lucide-react';
import type { StaffDocument } from './types';

/**
 * Academic/certification documents — optional, and the one piece of a staff
 * record a non-admin can manage themselves (see the backend's
 * isSelfOrAdmin guard): rendered both from the admin's StaffDetailModal and
 * from the staff member's own /staff/account page, unchanged either way —
 * the server decides who's allowed to call the endpoints this hits.
 */
export function DocumentsPanel({ staffId }: { staffId: string }) {
  const toast = useToast();
  const [documents, setDocuments] = useState<StaffDocument[] | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setDocuments(await fetchList<StaffDocument>(`/api/v1/staff/${staffId}/documents`));
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  async function upload(file: File) {
    if (!title.trim()) {
      toast.error('Give the document a title first.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      // Title before file — the backend only has fields parsed so far
      // available once request.file() resolves.
      form.append('title', title.trim());
      form.append('file', file);
      const res = await fetch(`/api/v1/staff/${staffId}/documents`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) {
        setTitle('');
        await load();
      } else {
        toast.error(json.error ?? 'Could not upload the document.');
      }
    } catch {
      toast.error('Network error while uploading.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(documentId: string) {
    const res = await submitJson(`/api/v1/staff/${staffId}/documents/${documentId}`, 'DELETE');
    if (res.ok) await load();
    else toast.error(res.error!);
  }

  return (
    <div className="space-y-3">
      {documents === null ? (
        <p className="text-sm text-text-faint">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-text-faint">No documents on file yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 min-w-0 text-primary-700 hover:underline"
              >
                <FileText className="w-4 h-4 shrink-0" aria-hidden />
                <span className="truncate">{d.title}</span>
              </a>
              <button type="button" onClick={() => void remove(d.id)} className="text-text-faint hover:text-red-600 shrink-0" aria-label={`Remove ${d.title}`}>
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <Input
            label="Document title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Bachelor's degree certificate"
          />
        </div>
        <label className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#E5E5E5] px-4 text-sm font-medium text-primary-700 cursor-pointer hover:bg-bg-subtle whitespace-nowrap">
          <Upload className="w-4 h-4" aria-hidden />
          {uploading ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="text-xs text-text-faint">JPEG, PNG, WebP, or PDF.</p>
    </div>
  );
}
