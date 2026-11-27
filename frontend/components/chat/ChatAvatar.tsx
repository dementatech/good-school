'use client';

import { DEFAULT_AVATAR } from '@/lib/avatar/default';
import { LifeBuoy, Megaphone, School, Users, UsersRound } from 'lucide-react';
import type { RoomKind } from '@/lib/communications/types';

const SIZES = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg' } as const;

// A person without a photo shows the default silhouette (DEFAULT_AVATAR).
// `seed` is kept for callers; it no longer picks a colour.
export function PersonAvatar({
  name,
  photoUrl,
  online,
  size = 'md',
}: {
  name: string;
  photoUrl?: string | null;
  online?: boolean;
  size?: keyof typeof SIZES;
  seed?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${SIZES[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl || DEFAULT_AVATAR} alt={name} className="size-full rounded-full object-cover bg-bg-muted" />
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
