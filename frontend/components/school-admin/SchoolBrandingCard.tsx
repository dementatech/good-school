'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { applyPrimary, DEFAULT_PRIMARY, isHex } from '@/lib/theme/school-theme';
import { SchoolLogo } from '@/components/admin/schools/SchoolLogo';

/**
 * Self-service brand colour for a school_admin, on the My School page. Only
 * the primary colour is editable here — the rest of the school record stays
 * read-only (a Good School admin owns it). Saving applies the colour live
 * across the portal via applyPrimary().
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
  const [color, setColor] = useState(primaryColor || DEFAULT_PRIMARY);
  const [saved, setSaved] = useState(primaryColor || DEFAULT_PRIMARY);
  const [saving, setSaving] = useState(false);
  const dirty = color.toLowerCase() !== saved.toLowerCase();

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
            Your brand colour, applied across your school&apos;s portals. The logo is set by a Good
            School administrator.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SchoolLogo logoUrl={logoUrl} name={schoolName} size="lg" />
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
