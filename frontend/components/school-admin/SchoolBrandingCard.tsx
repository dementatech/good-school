'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { submitJson } from '@/lib/api/envelope';
import { applyPrimary, DEFAULT_PRIMARY, isHex } from '@/lib/theme/school-theme';
import { SchoolLogo } from '@/components/admin/schools/SchoolLogo';

/**
 * Self-service branding for a school_admin, on the My School page — brand
 * colour and logo. The rest of the school record stays read-only (a Good
 * School admin owns it). Both save immediately (no separate submit step for
 * the logo — a single file field doesn't need batching) and refresh the
 * cached auth user so the sidebar/topbar/report cards pick up the change
 * live, the same way applyPrimary() does for the colour.
 */
export function SchoolBrandingCard({
  schoolName,
  logoUrl,
  primaryColor,
}: {
  schoolName: string;
  logoUrl: string | null;
  primaryColor: string;
}) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [color, setColor] = useState(primaryColor || DEFAULT_PRIMARY);
  const [saved, setSaved] = useState(primaryColor || DEFAULT_PRIMARY);
  const [saving, setSaving] = useState(false);
  const dirty = color.toLowerCase() !== saved.toLowerCase();

  const fileInput = useRef<HTMLInputElement>(null);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);

  function pickLogo(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Logo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be 5 MB or smaller.');
      return;
    }
    void uploadLogo(file);
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch('/api/v1/schools/me/logo', { method: 'POST', body, credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        toast.error(json.error ?? 'Could not upload the logo.');
        return;
      }
      setCurrentLogoUrl(json.data.logoUrl);
      await refresh();
      toast.success('Logo updated.');
    } catch {
      toast.error('Network error while uploading the logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    const res = await submitJson('/api/v1/schools/me/logo', 'DELETE');
    setLogoBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not remove the logo.');
      return;
    }
    setCurrentLogoUrl(null);
    await refresh();
    toast.success('Logo removed.');
  }

  async function save() {
    if (!isHex(color)) {
      toast.error('Enter a hex colour like #1e3a8a.');
      return;
    }
    setSaving(true);
    const res = await submitJson('/api/v1/schools/me/theme', 'PATCH', {
      primaryColor: color.toLowerCase(),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not save the brand colour.');
      return;
    }
    setSaved(color);
    applyPrimary(color);
    toast.success('Brand colour updated.');
  }

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-faint mb-1">Branding</p>
          <p className="text-sm text-text-muted">
            Your logo and brand colour, applied across your school&apos;s portals and report cards.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <SchoolLogo logoUrl={currentLogoUrl} name={schoolName} size="lg" />
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                pickLogo(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
                isLoading={logoBusy}
              >
                {currentLogoUrl ? 'Replace logo' : 'Add logo'}
              </Button>
              {currentLogoUrl && (
                <Button type="button" variant="outline" onClick={() => void removeLogo()} disabled={logoBusy}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-text-faint">JPEG, PNG, or WebP — up to 5 MB.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">
            Brand colour
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={isHex(color) ? color : DEFAULT_PRIMARY}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded-lg border border-border bg-bg-card p-1"
              aria-label="Brand colour"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder={DEFAULT_PRIMARY}
              spellCheck={false}
              className="w-28 rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm font-mono focus:border-primary-700 focus:outline-none"
            />
            {color.toLowerCase() !== DEFAULT_PRIMARY && (
              <button
                type="button"
                onClick={() => setColor(DEFAULT_PRIMARY)}
                className="text-xs text-text-muted underline"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>

        <div>
          <Button onClick={() => void save()} isLoading={saving} disabled={!dirty}>
            Save brand colour
          </Button>
        </div>
      </div>
    </Card>
  );
}
