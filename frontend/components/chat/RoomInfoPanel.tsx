'use client';

import { useState } from 'react';
import { BellOff, Bell, Crown, LogOut, Lock, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PersonAvatar, RoomAvatar } from './ChatAvatar';
import { PeoplePicker } from './PeoplePicker';
import { chatApi } from '@/lib/communications/api';
import { KIND_LABEL, type Contact, type RoomDetail } from '@/lib/communications/types';

interface Props {
  room: RoomDetail | null;
  myUserId: string | undefined;
  myRole: string | undefined;
  onlineIds: Set<string>;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
  onMessage: (userId: string) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function RoomInfoPanel({ room, myUserId, myRole, onlineIds, onClose, onChanged, onLeft, onMessage, onError, onSuccess }: Props) {
  const [detail, setDetail] = useState<RoomDetail | null>(room);
  const [editingName, setEditingName] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Map<string, Contact>>(new Map());
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!detail) return;
    const fresh = await chatApi.room(detail.id);
    if (fresh) setDetail(fresh);
    onChanged();
  }

  if (!detail) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const isCustom = detail.kind === 'group';
  const isAdmin = detail.myRole === 'admin' || myRole === 'school_admin';
  const isMember = detail.myRole !== null;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      onError(result.error ?? 'That didn’t work. Try again.');
      return false;
    }
    if (success) onSuccess(success);
    await reload();
    return true;
  }

  return (
    <Modal open onClose={onClose} title={detail.kind === 'direct' ? 'Contact info' : 'Group info'} size="lg">
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center">
          <RoomAvatar kind={detail.kind} title={detail.title} photoUrl={detail.photoUrl} size="lg" seed={detail.other?.userId ?? detail.id} />
          {editingName ? (
            <div className="mt-4 w-full space-y-3 text-left">
              <Input id="room-title" label="Group name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              <Input id="room-description" label="Description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
              <div className="flex gap-2">
                <Button inline variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
                <Button
                  inline
                  isLoading={busy}
                  disabled={!title.trim()}
                  onClick={async () => {
                    if (await run(() => chatApi.updateRoom(detail.id, { title: title.trim(), description: description.trim() || null }), 'Group updated.')) {
                      setEditingName(false);
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-3 text-lg font-semibold text-primary-900">{detail.title}</h2>
              <p className="text-sm text-text-muted">
                {detail.kind === 'direct'
                  ? detail.other
                    ? onlineIds.has(detail.other.userId)
                      ? 'Online'
                      : 'Private chat'
                    : 'Private chat'
                  : `${KIND_LABEL[detail.kind]} · ${detail.memberCount} members`}
              </p>
              {detail.description && <p className="mt-2 max-w-md text-sm text-text-secondary">{detail.description}</p>}
              {isCustom && isAdmin && isMember && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle(detail.title);
                    setDescription(detail.description ?? '');
                    setEditingName(true);
                  }}
                  className="mt-2 text-sm font-medium text-primary-700 hover:underline"
                >
                  Edit name and description
                </button>
              )}
            </>
          )}
        </div>

        {detail.archived && (
          <p className="rounded-lg bg-bg-muted px-3 py-2 text-sm text-text-muted">
            This class group is from an earlier year. It stays here so its history can still be read.
          </p>
        )}
        {!isCustom && detail.kind !== 'direct' && (
          <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">
            The school manages this group. People join and leave it automatically as staff, classes and enrollment change.
          </p>
        )}

        <div className="divide-y divide-border rounded-xl border border-border">
          {isMember && (
            <ToggleRow
              icon={detail.muted ? BellOff : Bell}
              title="Mute notifications"
              description="You'll still see new messages here, without sounds or alerts."
              checked={detail.muted}
              disabled={busy}
              onChange={(muted) => void run(() => chatApi.mute(detail.id, muted))}
            />
          )}
          {detail.kind !== 'direct' && detail.kind !== 'announcements' && isAdmin && isMember && !detail.archived && (
            <ToggleRow
              icon={Lock}
              title="Only admins can post"
              description="Turns the group into an announcement channel. Members can still read and react."
              checked={detail.onlyAdminsPost}
              disabled={busy}
              onChange={(onlyAdminsPost) => void run(() => chatApi.updateRoom(detail.id, { onlyAdminsPost }))}
            />
          )}
        </div>

        {detail.kind !== 'direct' || myRole === 'school_admin' ? (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary-900">
                {detail.memberCount} {detail.memberCount === 1 ? 'member' : 'members'}
              </h3>
              {isCustom && isAdmin && isMember && !adding && (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">
                  <UserPlus className="size-4" /> Add people
                </button>
              )}
            </div>

            {adding && (
              <div className="mb-4 rounded-xl border border-border p-3">
                <PeoplePicker
                  multi
                  showRoleFilter
                  selected={toAdd}
                  exclude={new Set(detail.members.map((m) => m.userId))}
                  onPick={(c) =>
                    setToAdd((prev) => {
                      const next = new Map(prev);
                      if (next.has(c.userId)) next.delete(c.userId);
                      else next.set(c.userId, c);
                      return next;
                    })
                  }
                />
                <div className="mt-3 flex gap-2">
                  <Button inline variant="outline" onClick={() => { setAdding(false); setToAdd(new Map()); }}>Cancel</Button>
                  <Button
                    inline
                    isLoading={busy}
                    disabled={toAdd.size === 0}
                    onClick={async () => {
                      if (await run(() => chatApi.addMembers(detail.id, [...toAdd.keys()]), `Added ${toAdd.size} ${toAdd.size === 1 ? 'person' : 'people'}.`)) {
                        setAdding(false);
                        setToAdd(new Map());
                      }
                    }}
                  >
                    Add {toAdd.size || ''}
                  </Button>
                </div>
              </div>
            )}

            <ul className="divide-y divide-border rounded-xl border border-border">
              {detail.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                  <PersonAvatar name={m.name} photoUrl={m.photoUrl} online={onlineIds.has(m.userId)} size="sm" seed={m.userId} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {m.userId === myUserId ? 'You' : m.name}
                    </span>
                    <span className="text-xs text-text-muted">{roleName(m.role)}</span>
                  </span>
                  {m.roomRole === 'admin' && detail.kind !== 'direct' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                      <ShieldCheck className="size-3" /> Admin
                    </span>
                  )}
                  {m.userId !== myUserId && detail.kind !== 'direct' && (STAFF.has(myRole ?? '') || STAFF.has(m.role)) && (
                    <button
                      type="button"
                      onClick={() => onMessage(m.userId)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
                    >
                      Message
                    </button>
                  )}
                  {isCustom && isAdmin && isMember && m.userId !== myUserId && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => chatApi.setMemberRole(detail.id, m.userId, m.roomRole === 'admin' ? 'member' : 'admin'))}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-bg-muted"
                        title={m.roomRole === 'admin' ? 'Remove as admin' : 'Make group admin'}
                        aria-label={m.roomRole === 'admin' ? `Remove ${m.name} as admin` : `Make ${m.name} a group admin`}
                      >
                        <Crown className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => chatApi.removeMember(detail.id, m.userId), `${m.name} removed.`)}
                        className="rounded-lg p-1.5 text-error hover:bg-error-bg"
                        title="Remove from group"
                        aria-label={`Remove ${m.name} from the group`}
                      >
                        <UserMinus className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
              {!detail.membersComplete && (
                <li className="px-3 py-2 text-xs text-text-muted">
                  …and {detail.memberCount - detail.members.length} more.
                </li>
              )}
            </ul>
          </section>
        ) : null}

        {isCustom && isMember && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const result = await chatApi.removeMember(detail.id, myUserId ?? '');
              if (!result.ok) {
                onError(result.error ?? "You couldn't leave the group.");
                return;
              }
              onSuccess(`You left ${detail.title}.`);
              onLeft();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-error/30 px-3 py-2.5 text-sm font-medium text-error hover:bg-error-bg"
          >
            <LogOut className="size-4" /> Leave group
          </button>
        )}
      </div>
    </Modal>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3 py-3">
      <Icon className="size-5 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="block text-xs text-text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-700/40 ${
          checked ? 'bg-primary-700' : 'bg-border-strong'
        }`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </label>
  );
}

const STAFF = new Set(['school_admin', 'teacher', 'staff']);

function roleName(role: string): string {
  return { school_admin: 'School admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' }[role] ?? role;
}
