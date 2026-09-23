'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle, LogOut, ChevronDown, Camera, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';

// Only the roles with nowhere else to manage a photo — teacher has its own
// richer flow at /staff/account (hits /api/v1/staff/:id/photo instead, see
// StaffAccountPage). Not opened up to student or the generic admin role.
const CAN_MANAGE_OWN_PHOTO = new Set(['parent', 'school_admin', 'super_admin']);

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Staff',
  staff: 'Staff',
  school_admin: 'School Admin',
  admin: 'Super Admin',
  super_admin: 'Super Admin',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AccountMenu({ accountHref, onSignOut }: { accountHref?: string; onSignOut: () => void }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const fileInputId = useId();
  const [uploading, setUploading] = useState(false);

  const canManagePhoto = !!user && CAN_MANAGE_OWN_PHOTO.has(user.role);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/auth/me/photo', { method: 'POST', body: form, credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) await refresh();
      else toast.error(json.error ?? 'Could not upload photo.');
    } catch {
      toast.error('Network error while uploading photo.');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    const res = await submitJson('/api/v1/auth/me/photo', 'DELETE');
    if (res.ok) await refresh();
    else toast.error(res.error!);
  }

  function openFilePicker() {
    document.getElementById(fileInputId)?.click();
  }

  const items: DropdownMenuItem[] = [];
  if (accountHref) {
    items.push({ label: 'My Account', icon: UserCircle, onClick: () => router.push(accountHref) });
  }
  if (canManagePhoto) {
    items.push({
      label: uploading ? 'Uploading…' : user?.photoUrl ? 'Replace photo' : 'Add photo',
      icon: Camera,
      disabled: uploading,
      separatorBefore: !accountHref,
      onClick: openFilePicker,
    });
    if (user?.photoUrl) {
      items.push({ label: 'Remove photo', icon: Trash2, onClick: () => void removePhoto() });
    }
  }
  items.push({
    label: 'Sign out',
    icon: LogOut,
    danger: true,
    separatorBefore: !!accountHref || canManagePhoto,
    onClick: onSignOut,
  });

  return (
    <>
      {canManagePhoto && (
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPhoto(file);
            e.target.value = '';
          }}
        />
      )}
      <DropdownMenu
        label="Account"
        items={items}
        trigger={
          <span className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border hover:bg-bg-muted transition-colors">
            {user?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                {user ? initials(user.name) : '—'}
              </span>
            )}
            {user && (
              <span className="hidden lg:block text-left leading-tight">
                <span className="block text-sm font-semibold text-primary-900">{user.name}</span>
                <span className="block text-xs text-text-muted">{ROLE_LABELS[user.role] ?? user.role}</span>
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden />
          </span>
        }
      />
    </>
  );
}
