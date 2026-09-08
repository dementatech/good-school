'use client';

// A school's logo when one's on file, an initials tile otherwise — never a
// blank space. Mirrors StaffAvatar for staff photos.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs rounded-lg',
  lg: 'w-20 h-20 text-xl rounded-2xl',
} as const;

export function SchoolLogo({
  logoUrl,
  name,
  size = 'sm',
}: {
  logoUrl: string | null;
  name: string;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const cls = SIZE_CLASSES[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={`${cls} object-contain bg-white border border-[#EAEAEA] shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${cls} bg-[#FAFAFA] text-[#666666] font-semibold flex items-center justify-center shrink-0`}
    >
      {initials(name) || '—'}
    </span>
  );
}
