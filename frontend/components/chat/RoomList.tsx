'use client';

import { useMemo, useState } from 'react';
import { BellOff, Eye, Lock, MessageSquarePlus, Search, Users } from 'lucide-react';
import { RoomAvatar } from './ChatAvatar';
import { lastMessagePreview, listTime } from '@/lib/communications/format';
import type { RoomSummary } from '@/lib/communications/types';

type Filter = 'all' | 'unread' | 'direct' | 'groups';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'direct', label: 'Private' },
  { key: 'groups', label: 'Groups' },
];

interface Props {
  rooms: RoomSummary[];
  loading: boolean;
  selectedId: string | null;
  myUserId: string | undefined;
  typingByRoom: Record<string, string[]>;
  onlineIds: Set<string>;
  onSelect: (id: string) => void;
  onNewChat: (() => void) | null;
  onNewGroup: (() => void) | null;
  /** School admins only: switch to the read-only list of every chat in the school. */
  oversight: { active: boolean; toggle: () => void; query: string; setQuery: (q: string) => void } | null;
}

export function RoomList({
  rooms,
  loading,
  selectedId,
  myUserId,
  typingByRoom,
  onlineIds,
  onSelect,
  onNewChat,
  onNewGroup,
  oversight,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    if (oversight?.active) return rooms;
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (filter === 'unread') return r.unreadCount > 0;
      if (filter === 'direct') return r.kind === 'direct';
      if (filter === 'groups') return r.kind !== 'direct';
      return true;
    });
  }, [rooms, query, filter, oversight?.active]);

  const searchValue = oversight?.active ? oversight.query : query;
  const setSearch = oversight?.active ? oversight.setQuery : setQuery;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold text-primary-900">{oversight?.active ? 'All school chats' : 'Chats'}</h1>
        <div className="flex items-center gap-1">
          {oversight && (
            <button
              type="button"
              onClick={oversight.toggle}
              className={`rounded-lg p-2 transition-colors ${
                oversight.active ? 'bg-primary-700 text-white' : 'text-text-muted hover:bg-bg-muted'
              }`}
              title={oversight.active ? 'Back to my chats' : 'See every chat in the school (read-only)'}
              aria-label={oversight.active ? 'Back to my chats' : 'See every chat in the school'}
              aria-pressed={oversight.active}
            >
              <Eye className="size-5" />
            </button>
          )}
          {!oversight?.active && onNewGroup && (
            <button
              type="button"
              onClick={onNewGroup}
              className="rounded-lg p-2 text-text-muted hover:bg-bg-muted"
              title="New group"
              aria-label="New group"
            >
              <Users className="size-5" />
            </button>
          )}
          {!oversight?.active && onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className="rounded-lg p-2 text-primary-700 hover:bg-primary-50"
              title="New chat"
              aria-label="New chat"
            >
              <MessageSquarePlus className="size-5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
          <input
            value={searchValue}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={oversight?.active ? 'Search by person or group' : 'Search chats'}
            className="w-full rounded-xl border border-border bg-bg-muted py-2 pl-9 pr-3 text-sm focus:border-primary-700 focus:bg-white focus:outline-none"
          />
        </label>
      </div>

      {oversight?.active ? (
        <p className="mx-4 mt-3 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
          Read-only. You can open any chat in your school, including private ones. Nobody is told when you read.
        </p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3" role="tablist" aria-label="Filter chats">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary-700 text-white' : 'bg-bg-muted text-text-secondary hover:bg-primary-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <ul className="flex-1 overflow-y-auto pb-2" aria-label="Chats">
        {loading && rooms.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="size-11 animate-pulse rounded-full bg-bg-muted" />
              <span className="flex-1 space-y-2">
                <span className="block h-3 w-1/2 animate-pulse rounded bg-bg-muted" />
                <span className="block h-3 w-3/4 animate-pulse rounded bg-bg-muted" />
              </span>
            </li>
          ))}
        {!loading && visible.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-text-muted">
            {oversight?.active
              ? 'No chats match that search.'
              : filter === 'unread'
                ? "You're all caught up."
                : 'No chats yet. Start one with the button above.'}
          </li>
        )}
        {visible.map((room) => {
          const typing = typingByRoom[room.id] ?? [];
          const online = room.other ? onlineIds.has(room.other.userId) : false;
          const active = room.id === selectedId;
          return (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelect(room.id)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  active ? 'bg-primary-100' : 'hover:bg-bg-muted'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                <RoomAvatar kind={room.kind} title={room.title} photoUrl={room.photoUrl} online={online} seed={room.other?.userId ?? room.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${room.unreadCount > 0 ? 'font-semibold text-primary-900' : 'font-medium text-text-primary'}`}>
                      {room.title}
                    </span>
                    <span className={`shrink-0 text-[11px] ${room.unreadCount > 0 && !room.muted ? 'font-semibold text-primary-700' : 'text-text-faint'}`}>
                      {listTime(room.lastMessageAt ?? room.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${typing.length ? 'font-medium text-success' : 'text-text-muted'}`}>
                      {typing.length
                        ? room.kind === 'direct'
                          ? 'typing…'
                          : `${typing[0].split(' ')[0]} is typing…`
                        : lastMessagePreview(room.lastMessage, myUserId, room.kind !== 'direct')}
                    </span>
                    {room.onlyAdminsPost && room.kind !== 'announcements' && (
                      <Lock className="size-3 shrink-0 text-text-faint" aria-label="Only admins can post" />
                    )}
                    {room.muted && <BellOff className="size-3.5 shrink-0 text-text-faint" aria-label="Muted" />}
                    {room.unreadCount > 0 && (
                      <span
                        className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5 ${
                          room.muted ? 'bg-text-faint text-white' : 'bg-accent text-primary-900'
                        }`}
                        aria-label={`${room.unreadCount} unread`}
                      >
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
