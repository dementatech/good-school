'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PeoplePicker } from './PeoplePicker';
import { chatApi } from '@/lib/communications/api';
import type { Contact, RoomSummary } from '@/lib/communications/types';

export function NewChatPanel({
  open,
  onClose,
  isStaff,
  onStarted,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  isStaff: boolean;
  onStarted: (room: RoomSummary) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function start(contact: Contact) {
    if (busy) return;
    setBusy(true);
    const result = await chatApi.startDirect(contact.userId);
    setBusy(false);
    if (!result.ok || !result.data) {
      onError(result.error ?? "That chat couldn't be started.");
      return;
    }
    onStarted(result.data);
  }

  return (
    <Modal open={open} onClose={onClose} title="New chat">
      <p className="mb-3 text-sm text-text-muted">
        {isStaff
          ? 'Message anyone at your school: staff, learners or parents.'
          : 'You can message the school administration and your teachers.'}
      </p>
      {open && <PeoplePicker showRoleFilter={isStaff} onPick={(c) => void start(c)} />}
    </Modal>
  );
}

export function NewGroupPanel({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (room: RoomSummary) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [onlyAdminsPost, setOnlyAdminsPost] = useState(false);
  const [members, setMembers] = useState<Map<string, Contact>>(new Map());
  const [titleError, setTitleError] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(c: Contact) {
    setMembers((prev) => {
      const next = new Map(prev);
      if (next.has(c.userId)) next.delete(c.userId);
      else next.set(c.userId, c);
      return next;
    });
  }

  function reset() {
    setTitle('');
    setDescription('');
    setOnlyAdminsPost(false);
    setMembers(new Map());
    setTitleError('');
  }

  async function create() {
    if (!title.trim()) {
      setTitleError('Give the group a name.');
      return;
    }
    setBusy(true);
    const result = await chatApi.createGroup({
      title: title.trim(),
      description: description.trim() || null,
      onlyAdminsPost,
      memberUserIds: [...members.keys()],
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      onError(result.error ?? "The group couldn't be created.");
      return;
    }
    reset();
    onCreated(result.data);
  }

  return (
    <Modal open={open} onClose={onClose} title="New group" size="lg">
      <div className="space-y-4">
        <Input
          id="group-title"
          label="Group name"
          value={title}
          maxLength={80}
          error={titleError}
          placeholder="e.g. P6 Science teachers, Sports committee"
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleError('');
          }}
        />
        <Input
          id="group-description"
          label="Description (optional)"
          value={description}
          maxLength={500}
          placeholder="What the group is for"
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-start gap-3 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={onlyAdminsPost}
            onChange={(e) => setOnlyAdminsPost(e.target.checked)}
            className="mt-0.5 size-4 accent-primary-700"
          />
          <span className="text-sm">
            <span className="block font-medium text-text-primary">Announcement group</span>
            <span className="text-text-muted">
              Only you and other group admins can post. Members get a notification for every post.
            </span>
          </span>
        </label>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-text-muted">
            Members{members.size > 0 ? ` (${members.size} chosen)` : ''}
          </p>
          {members.size > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[...members.values()].map((m) => (
                <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-primary-100 py-1 pl-3 pr-1 text-xs text-primary-900">
                  {m.name}
                  <button type="button" onClick={() => toggle(m)} className="rounded-full p-0.5 hover:bg-primary-200" aria-label={`Remove ${m.name}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {open && <PeoplePicker multi showRoleFilter selected={members} onPick={toggle} />}
        </div>

        <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
          <Button inline variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button inline isLoading={busy} onClick={() => void create()}>
            Create group
          </Button>
        </div>
      </div>
    </Modal>
  );
}
