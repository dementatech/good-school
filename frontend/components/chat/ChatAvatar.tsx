'use client';

import { LifeBuoy, Megaphone, School, Users, UsersRound } from 'lucide-react';
import { initials } from '@/lib/communications/format';
import type { RoomKind } from '@/lib/communications/types';

const SIZES = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg' } as const;

// A small fixed palette so the same person keeps the same colour everywhere.
const TONES = [
  'bg-primary-100 text-primary-900',
  'bg-accent-light text-accent-dark',
  'bg-success-bg text-success',
  'bg-warning-bg text-warning',
  'bg-primary-200 text-primary-900',
];

function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export function PersonAvatar({
  name,
  photoUrl,
  online,
  size = 'md',
  seed,
}: {
  name: string;
  photoUrl?: string | null;
  online?: boolean;
  size?: keyof typeof SIZES;
  seed?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${SIZES[size]}`}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="size-full rounded-full object-cover bg-bg-muted" />
      ) : (
        <span
          aria-hidden
          className={`size-full rounded-full inline-flex items-center justify-center font-semibold ${toneFor(seed ?? name)}`}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-white"
          aria-label="Online"
          role="img"
        />
      )}
    </span>
  );
}

const KIND_ICON: Partial<Record<RoomKind, typeof Users>> = {
  group: Users,
  staff_room: UsersRound,
  announcements: Megaphone,
  class: School,
  class_parents: Users,
  support: LifeBuoy,
};

export function RoomAvatar({
  kind,
  title,
  photoUrl,
  online,
  size = 'md',
  seed,
}: {
  kind: RoomKind;
  title: string;
  photoUrl?: string | null;
  online?: boolean;
  size?: keyof typeof SIZES;
  seed: string;
}) {
  if (kind === 'direct') return <PersonAvatar name={title} photoUrl={photoUrl} online={online} size={size} seed={seed} />;
  const Icon = KIND_ICON[kind] ?? Users;
  const tone =
    kind === 'announcements' ? 'bg-accent text-primary-900' : kind === 'support' ? 'bg-primary-900 text-accent' : 'bg-primary-700 text-white';
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full ${tone} ${SIZES[size]}`}>
      <Icon className={size === 'lg' ? 'size-7' : size === 'sm' ? 'size-4' : 'size-5'} />
    </span>
  );
}
