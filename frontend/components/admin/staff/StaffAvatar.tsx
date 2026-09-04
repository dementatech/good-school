'use client';

// A photo when one's on file, an initials avatar otherwise — never a blank
// space. Restores the fallback the old TERECO staff stub had before the
// page was rebuilt on the new backend.

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs rounded-full',
  lg: 'w-24 h-24 text-2xl rounded-2xl',
} as const;

export function StaffAvatar({
  photoUrl,
  name,
  size = 'sm',
}: {
  photoUrl: string | null;
  name: string;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const cls = SIZE_CLASSES[size];
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={`${cls} object-cover border border-[#EAEAEA] shrink-0`} />;
  }
  return (
    <span className={`${cls} bg-[#FAFAFA] text-[#666666] font-medium flex items-center justify-center shrink-0`}>
      {initials(name) || '—'}
    </span>
  );
}
