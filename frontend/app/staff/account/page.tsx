'use client';

import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { ChangePasswordCard } from '@/components/auth/ChangePasswordCard';
import { DocumentsPanel } from '@/components/admin/staff/DocumentsPanel';
import { StaffAvatar } from '@/components/admin/staff/StaffAvatar';

// Self-service — same isSelfOrAdmin guard on the backend as the documents
// panel below, hits the same /api/v1/staff/:id/photo endpoints the admin's
// StaffDetailModal uses, just always with the signed-in user's own id.
function ProfilePhotoCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl ?? null);

  if (!user) return null;

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/v1/staff/${user!.id}/photo`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) {
        setPhotoUrl(json.data.photoUrl);
        await refresh();
      } else {
        toast.error(json.error ?? 'Could not upload photo.');
      }
    } catch {
      toast.error('Network error while uploading photo.');
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    const res = await submitJson(`/api/v1/staff/${user!.id}/photo`, 'DELETE');
    if (res.ok) {
      setPhotoUrl(null);
      await refresh();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-bold text-primary-900 mb-3">Profile photo</h2>
      <div className="flex items-center gap-4">
        <StaffAvatar photoUrl={photoUrl} name={user.name} size="lg" />
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 cursor-pointer hover:underline">
            <Camera className="w-4 h-4" aria-hidden />
            {uploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </label>
          {photoUrl && (
            <button
              type="button"
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-red-600"
            >
              <X className="w-4 h-4" aria-hidden />
              Remove photo
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// The self-service half of docs/design/teacher-staff-module.md's academic
// documents ask: optional at hire time, but once a staff member has logged
// in, uploading their own certificates is theirs to do — not something an
// admin has to do on their behalf. Hits the same /api/v1/staff/:id/documents
// endpoints as the admin's StaffDetailModal; the backend's isSelfOrAdmin
// guard is what actually makes "their own" true, this page just calls it
// with the signed-in user's own id.
export default function StaffAccountPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">My account</h1>
        <p className="text-sm text-text-muted">Your sign-in details, and your own academic documents.</p>
      </div>

      <ProfilePhotoCard />

      <Card>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-text-muted">Name</dt>
            <dd className="text-text-primary mt-0.5">{user?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Staff ID</dt>
            <dd className="text-text-primary mt-0.5">{user?.staffId || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-text-muted">Email</dt>
            <dd className="text-text-primary mt-0.5 truncate">{user?.email || '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-primary-900 mb-3">Academic documents</h2>
        <p className="text-xs text-text-muted mb-3">
          Certificates, transcripts, or your national ID — optional, and only visible to you and your
          school admin.
        </p>
        {user && <DocumentsPanel staffId={user.id} />}
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
