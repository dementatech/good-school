'use client';

import { Card } from '@/components/ui/Card';
import { useAuth } from '@/components/auth/AuthContext';
import { ChangePasswordCard } from '@/components/auth/ChangePasswordCard';
import { DocumentsPanel } from '@/components/admin/staff/DocumentsPanel';

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
