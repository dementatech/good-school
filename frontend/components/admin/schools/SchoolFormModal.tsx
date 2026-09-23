'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_LABEL, sectionsOf, type SchoolSection } from '@/lib/levels';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { DEFAULT_PRIMARY, isHex } from '@/lib/theme/school-theme';
import { SchoolLogo } from './SchoolLogo';
import {
  GENDERS,
  OWNERSHIP,
  REGISTRATION,
  SCHOOL_TYPES,
  type GenderComposition,
  type OwnershipType,
  type RegistrationStatus,
  type School,
  type SchoolType,
} from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = '—',
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (v: T | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm capitalize"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

type FormState = {
  name: string;
  legalName: string;
  emisCodes: Record<SchoolSection, string>;
  unebCentreNumber: string;
  ownershipType: OwnershipType | null;
  registrationStatus: RegistrationStatus | null;
  district: string;
  subCounty: string;
  address: string;
  headTeacherName: string;
  headTeacherContact: string;
  phone: string;
  email: string;
  website: string;
  schoolType: SchoolType | null;
  genderComposition: GenderComposition | null;
  offersKindergarten: boolean;
  offersPrimary: boolean;
  offersOLevel: boolean;
  offersALevel: boolean;
};

// A school runs sections — Nursery, Primary, Secondary (O/A-Level). Nursery
// and Primary may share one school (the admin switches between them in the
// portal); Secondary always stands alone. The school only ever sees the
// sections ticked here.
type LevelKey = 'offersKindergarten' | 'offersPrimary' | 'offersOLevel' | 'offersALevel';
const LEVEL_OPTIONS: readonly (readonly [LevelKey, string])[] = [
  ['offersKindergarten', 'Nursery / Kindergarten (Baby–Top Class)'],
  ['offersPrimary', 'Primary (P1–P7)'],
  ['offersOLevel', 'O-Level (S1–S4)'],
  ['offersALevel', 'A-Level (S5–S6)'],
];
// One-click starting points for the usual setups — the ticks stay editable.
const LEVEL_PRESETS: { label: string; levels: LevelKey[] }[] = [
  { label: 'Nursery only', levels: ['offersKindergarten'] },
  { label: 'Primary only', levels: ['offersPrimary'] },
  { label: 'Nursery + Primary', levels: ['offersKindergarten', 'offersPrimary'] },
  { label: 'Secondary', levels: ['offersOLevel', 'offersALevel'] },
];
const SECONDARY_KEYS: LevelKey[] = ['offersOLevel', 'offersALevel'];
const JUNIOR_KEYS: LevelKey[] = ['offersKindergarten', 'offersPrimary'];

function initial(s?: School): FormState {
  return {
    name: s?.name ?? '',
    legalName: s?.legalName ?? '',
    emisCodes: {
      KINDERGARTEN: s?.emisCodes.KINDERGARTEN ?? '',
      PRIMARY: s?.emisCodes.PRIMARY ?? '',
      SECONDARY: s?.emisCodes.SECONDARY ?? '',
    },
    unebCentreNumber: s?.unebCentreNumber ?? '',
    ownershipType: s?.ownershipType ?? null,
    registrationStatus: s?.registrationStatus ?? null,
    district: s?.district ?? '',
    subCounty: s?.subCounty ?? '',
    address: s?.address ?? '',
    headTeacherName: s?.headTeacherName ?? '',
    headTeacherContact: s?.headTeacherContact ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    website: s?.website ?? '',
    schoolType: s?.schoolType ?? null,
    genderComposition: s?.genderComposition ?? null,
    offersKindergarten: s?.offersKindergarten ?? false,
    offersPrimary: s?.offersPrimary ?? false,
    offersOLevel: s?.offersOLevel ?? false,
    offersALevel: s?.offersALevel ?? false,
  };
}

export function SchoolFormModal({
  open,
  onClose,
  onSaved,
  school,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  school?: School;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initial(school));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Each ticked section is its own EMIS institution and gets its own number.
  const sectionsTicked = sectionsOf(form);

  // Logo is a separate multipart upload (POST /schools/:id/logo), done after
  // the school row exists — so on create we save the row first, then upload.
  const fileInput = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoObjectUrl = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );
  useEffect(() => {
    if (!logoObjectUrl) return;
    return () => URL.revokeObjectURL(logoObjectUrl);
  }, [logoObjectUrl]);

  const logoPreview = logoObjectUrl ?? (removeLogo ? null : (school?.logoUrl ?? null));

  // Brand colour — a separate PATCH /schools/:id/theme, also after the row exists.
  const initialPrimary = school?.primaryColor ?? DEFAULT_PRIMARY;
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const primaryChanged = primaryColor.toLowerCase() !== initialPrimary.toLowerCase();

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
    setLogoFile(file);
    setRemoveLogo(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!LEVEL_OPTIONS.some(([k]) => form[k])) {
      toast.error('Tick at least one level this school offers.');
      return;
    }
    if (SECONDARY_KEYS.some((k) => form[k]) && JUNIOR_KEYS.some((k) => form[k])) {
      toast.error("Secondary can't share a school with Nursery or Primary — register it separately.");
      return;
    }
    setSaving(true);
    const trim = (v: string) => v.trim() || null;
    const payload = {
      name: form.name.trim(),
      legalName: trim(form.legalName),
      // Only the sections this school runs — EMIS registers each separately.
      emisCodes: Object.fromEntries(sectionsTicked.map((sec) => [sec, trim(form.emisCodes[sec])])),
      unebCentreNumber: trim(form.unebCentreNumber),
      ownershipType: form.ownershipType,
      registrationStatus: form.registrationStatus,
      district: trim(form.district),
      subCounty: trim(form.subCounty),
      address: trim(form.address),
      headTeacherName: trim(form.headTeacherName),
      headTeacherContact: trim(form.headTeacherContact),
      phone: trim(form.phone),
      email: trim(form.email),
      website: trim(form.website),
      schoolType: form.schoolType,
      genderComposition: form.genderComposition,
      offersKindergarten: form.offersKindergarten,
      offersPrimary: form.offersPrimary,
      offersOLevel: form.offersOLevel,
      offersALevel: form.offersALevel,
    };
    const res = school
      ? await submitJson<School>(`/api/v1/schools/${school.id}`, 'PATCH', payload)
      : await submitJson<School>('/api/v1/schools', 'POST', payload);

    if (!res.ok) {
      setSaving(false);
      toast.error(res.error!);
      return;
    }

    // The row is saved; the logo is best-effort from here — a failed upload
    // shouldn't undo a successful registration.
    const schoolId = school?.id ?? res.data?.id;
    let brandingWarning: string | null = null;
    if (schoolId && logoFile) {
      const body = new FormData();
      body.append('file', logoFile);
      try {
        const up = await fetch(`/api/v1/schools/${schoolId}/logo`, {
          method: 'POST',
          body,
          credentials: 'include',
        });
        const json = await up.json().catch(() => ({}));
        if (!up.ok || json.success === false) {
          brandingWarning = json.error ?? 'the logo could not be uploaded';
        }
      } catch {
        brandingWarning = 'the logo could not be uploaded (network error)';
      }
    } else if (schoolId && removeLogo && school?.logoUrl) {
      await submitJson(`/api/v1/schools/${schoolId}/logo`, 'DELETE');
    }

    if (schoolId && primaryChanged && isHex(primaryColor)) {
      const themeRes = await submitJson(`/api/v1/schools/${schoolId}/theme`, 'PATCH', {
        primaryColor: primaryColor.toLowerCase(),
      });
      if (!themeRes.ok && !brandingWarning) {
        brandingWarning = themeRes.error ?? 'the brand colour could not be saved';
      }
    }

    setSaving(false);
    if (brandingWarning) {
      toast.error(`School saved, but ${brandingWarning}. Edit the school to try again.`);
    } else {
      toast.success(school ? 'School updated.' : 'School registered — pending verification.');
    }
    await onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={school ? `Edit ${school.name}` : 'Register a school'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-6">
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Display name"
              placeholder="St Andrew's SS"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
            <Input
              label="Legal / registered name"
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
            />
          </div>
        </Section>

        <Section title="Branding">
          <div className="flex items-center gap-4">
            <SchoolLogo logoUrl={logoPreview} name={form.name || 'School'} size="lg" />
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
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  {logoPreview ? 'Replace logo' : 'Add logo'}
                </Button>
                {logoPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLogoFile(null);
                      setRemoveLogo(true);
                    }}
                  >
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
                value={isHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded-lg border border-border bg-bg-card p-1"
                aria-label="Brand colour"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_PRIMARY}
                spellCheck={false}
                className="w-28 rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm font-mono focus:border-primary-700 focus:outline-none"
              />
              {primaryColor.toLowerCase() !== DEFAULT_PRIMARY && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPrimaryColor(DEFAULT_PRIMARY)}
                >
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-text-faint mt-1">
              Applied across the school&apos;s portals. Leave as {DEFAULT_PRIMARY} for the default.
            </p>
          </div>
        </Section>

        <Section title="Regulatory">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sectionsTicked.length === 0 && (
              <p className="text-xs text-text-faint sm:col-span-2">Tick the levels offered to enter EMIS numbers.</p>
            )}
            {sectionsTicked.map((sec) => (
              <Input
                key={sec}
                label={sectionsTicked.length > 1 ? `${SECTION_LABEL[sec]} EMIS number` : 'EMIS number'}
                value={form.emisCodes[sec]}
                onChange={(e) => set('emisCodes', { ...form.emisCodes, [sec]: e.target.value })}
              />
            ))}
            <Input
              label="UNEB centre number"
              value={form.unebCentreNumber}
              onChange={(e) => set('unebCentreNumber', e.target.value)}
            />
            <Choice
              label="Ownership"
              value={form.ownershipType}
              options={OWNERSHIP}
              onChange={(v) => set('ownershipType', v)}
            />
            <Choice
              label="Registration status"
              value={form.registrationStatus}
              options={REGISTRATION}
              onChange={(v) => set('registrationStatus', v)}
            />
          </div>
        </Section>

        <Section title="Location">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="District"
              value={form.district}
              onChange={(e) => set('district', e.target.value)}
            />
            <Input
              label="Sub-county / division"
              value={form.subCounty}
              onChange={(e) => set('subCounty', e.target.value)}
            />
          </div>
          <Input
            label="Physical address"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Section>

        <Section title="Leadership & contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Head Teacher / Director"
              value={form.headTeacherName}
              onChange={(e) => set('headTeacherName', e.target.value)}
            />
            <Input
              label="Head Teacher contact"
              value={form.headTeacherContact}
              onChange={(e) => set('headTeacherContact', e.target.value)}
            />
            <Input label="School phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            <Input label="School email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <Input label="Website" value={form.website} onChange={(e) => set('website', e.target.value)} />
        </Section>

        <Section title="Operating profile">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Choice
              label="School type"
              value={form.schoolType}
              options={SCHOOL_TYPES}
              onChange={(v) => set('schoolType', v)}
            />
            <Choice
              label="Gender composition"
              value={form.genderComposition}
              options={GENDERS}
              onChange={(v) => set('genderComposition', v)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Levels offered *</p>
            <div className="flex flex-wrap gap-1.5">
              {LEVEL_PRESETS.map((preset) => {
                const active = LEVEL_OPTIONS.every(([k]) => form[k] === preset.levels.includes(k));
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        ...Object.fromEntries(LEVEL_OPTIONS.map(([k]) => [k, preset.levels.includes(k)])),
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      active
                        ? 'border-primary-700 bg-primary-50 text-primary-900'
                        : 'border-border text-text-muted hover:text-primary-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {LEVEL_OPTIONS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-[#12333F]">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => {
                      const on = e.target.checked;
                      // Secondary never shares a school with Nursery/Primary —
                      // ticking one side clears the other.
                      const clears = on ? (SECONDARY_KEYS.includes(key) ? JUNIOR_KEYS : SECONDARY_KEYS) : [];
                      setForm((f) => ({ ...f, [key]: on, ...Object.fromEntries(clears.map((k) => [k, false])) }));
                    }}
                    className="rounded border-[#E5E5E5]"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-text-faint">
              Nursery and Primary can run under one school — its admin switches between the two
              sections. Secondary is always registered on its own. The school only ever sees what&apos;s
              ticked here; a section with classes can&apos;t be removed until its classes are.
            </p>
          </div>
        </Section>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {school ? 'Save changes' : 'Register school'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
