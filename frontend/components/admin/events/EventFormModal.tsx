'use client';

/* eslint-disable @next/next/no-img-element -- a local preview, or a stored image at an unknown size. */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
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
  const examSynced = Boolean(initial?.schoolExamId);

  // null = leave the stored picture alone. Only uploaded after the event saves,
  // because a new event has no id to attach it to before that.
  const [newThumbnail, setNewThumbnail] = useState<File | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const shownThumbnail = preview ?? (removeThumbnail ? null : (initial?.thumbnailUrl ?? null));

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickThumbnail(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('The picture must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('The picture must be 5 MB or smaller.');
      return;
    }
    setNewThumbnail(file);
    setRemoveThumbnail(false);
    setPreview(URL.createObjectURL(file));
  }

  function clearThumbnail() {
    setNewThumbnail(null);
    setPreview(null);
    setRemoveThumbnail(Boolean(initial?.thumbnailUrl));
    if (fileInput.current) fileInput.current.value = '';
  }

  /** Returns false if the picture failed. The event itself has already saved by then. */
  async function saveThumbnail(eventId: string): Promise<boolean> {
    if (removeThumbnail) {
      return (await submitJson(`/api/v1/events/${eventId}/thumbnail`, 'DELETE')).ok;
    }
    if (!newThumbnail) return true;
    const body = new FormData();
    body.append('file', newThumbnail);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/thumbnail`, { method: 'POST', body, credentials: 'include' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !eventDate) {
      toast.error('Title and date are required.');
      return;
    }
    setSaving(true);
    const body = { title: title.trim(), description: description.trim() || null, eventDate, eventType, audience };
    // An exam-synced event's details belong to the exam, but its picture doesn't.
    const res = examSynced
      ? { ok: true as const, data: initial, error: undefined }
      : initial
        ? await submitJson<SchoolEvent>(`/api/v1/events/${initial.id}`, 'PATCH', body)
        : await submitJson<SchoolEvent>('/api/v1/events', 'POST', body);
    const pictureSaved = res.ok && res.data ? await saveThumbnail(res.data.id) : true;
    setSaving(false);
    if (res.ok) {
      if (pictureSaved) toast.success(initial ? 'Event updated.' : 'Event added to the calendar.');
      else toast.error('The event saved, but its picture could not be. Edit the event to try again.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.title}` : 'Add event'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-primary-900">Picture</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a picture for this event"
            onChange={(e) => pickThumbnail(e.target.files?.[0] ?? null)}
          />
          {shownThumbnail ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
              <img src={shownThumbnail} alt="" className="h-40 w-full object-cover" />
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full bg-primary-900 px-3 py-1.5 text-xs font-semibold text-white">
                  Replace
                </button>
                <button type="button" onClick={clearThumbnail} aria-label="Remove picture" className="flex size-8 items-center justify-center rounded-full bg-white text-error shadow-card">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-bg-subtle text-sm font-medium text-primary-700 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              <ImagePlus className="size-5" aria-hidden />
              Add a picture
              <span className="text-xs font-normal text-muted-foreground">JPEG, PNG or WebP, up to 5 MB</span>
            </button>
          )}
        </div>

        {examSynced ? (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            This event comes from an exam, so you can only change its picture here. Edit the exam to change its details.
          </p>
        ) : (
          <>
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
          </>
        )}

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
