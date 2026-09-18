'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import {
  EVENT_AUDIENCE_LABEL,
  EVENT_TYPE_LABEL,
  submitJson,
  type SchoolEvent,
  type SchoolEventAudience,
  type SchoolEventType,
} from './types';

export function EventFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Omit to create; pass to edit an existing event. */
  initial?: SchoolEvent;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [eventType, setEventType] = useState<SchoolEventType>(initial?.eventType ?? 'other');
  const [audience, setAudience] = useState<SchoolEventAudience>(initial?.audience ?? 'all');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !eventDate) {
      toast.error('Title and date are required.');
      return;
    }
    setSaving(true);
    const body = { title: title.trim(), description: description.trim() || null, eventDate, eventType, audience };
    const res = initial
      ? await submitJson(`/api/v1/events/${initial.id}`, 'PATCH', body)
      : await submitJson('/api/v1/events', 'POST', body);
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Event updated.' : 'Event added to the calendar.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.title}` : 'Add event'}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input label="Date *" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as SchoolEventType)}
            options={Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Visible to"
            value={audience}
            onChange={(e) => setAudience(e.target.value as SchoolEventAudience)}
            options={Object.entries(EVENT_AUDIENCE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add event'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
