'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Paperclip, Pencil, Reply, Send, X } from 'lucide-react';
import { fileSize, messageSnippet } from '@/lib/communications/format';
import type { ChatMessage } from '@/lib/communications/types';

const ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
const MAX_BYTES = 5 * 1024 * 1024;

// Unsent drafts per chat, kept while you move between chats.
const drafts = new Map<string, string>();

interface Props {
  roomId: string;
  disabledReason: string | null;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  myUserId: string | undefined;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string, file: File | null) => Promise<boolean>;
  onSaveEdit: (body: string) => Promise<boolean>;
  onTyping: () => void;
  onError: (message: string) => void;
}

export function Composer({
  roomId,
  disabledReason,
  replyTo,
  editing,
  myUserId,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onTyping,
  onError,
}: Props) {
  const [draft, setDraft] = useState(() => (editing ? editing.body : (drafts.get(roomId) ?? '')));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);

  // The composer is re-created when editing starts or stops, so focus it then.
  useEffect(() => {
    if (editing || replyTo) textRef.current?.focus();
  }, [editing, replyTo]);

  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function change(value: string) {
    setDraft(value);
    if (!editing) drafts.set(roomId, value);
    const now = Date.now();
    if (value && now - lastTypingRef.current > 3000) {
      lastTypingRef.current = now;
      onTyping();
    }
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      onError('That file is too big. The limit is 5 MB.');
      return;
    }
    setFile(f);
    textRef.current?.focus();
  }

  async function submit() {
    if (busy) return;
    const body = draft.trim();
    if (editing) {
      if (!body && !editing.attachment) return;
      setBusy(true);
      const ok = await onSaveEdit(body);
      setBusy(false);
      if (ok) {
        setDraft(drafts.get(roomId) ?? '');
        onCancelEdit();
      }
      return;
    }
    if (!body && !file) return;
    setBusy(true);
    const sentFile = file;
    // Clear straight away so it feels instant; put it back if sending fails.
    setDraft('');
    setFile(null);
    drafts.set(roomId, '');
    const ok = await onSend(body, sentFile);
    setBusy(false);
    if (!ok) {
      setDraft(body);
      setFile(sentFile);
      drafts.set(roomId, body);
    }
    textRef.current?.focus();
  }

  if (disabledReason) {
    return (
      <div className="border-t border-border bg-bg-subtle px-4 py-3 text-center text-sm text-text-muted">{disabledReason}</div>
    );
  }

  const banner = editing ?? replyTo;

  return (
    <div
      className="border-t border-border bg-white px-3 py-2 sm:px-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      {banner && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-primary-700 bg-bg-muted px-3 py-1.5">
          {editing ? <Pencil className="mt-0.5 size-4 shrink-0 text-primary-700" /> : <Reply className="mt-0.5 size-4 shrink-0 text-primary-700" />}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-primary-700">
              {editing
                ? 'Editing message'
                : `Replying to ${replyTo!.sender?.userId === myUserId ? 'yourself' : (replyTo!.sender?.name ?? 'message')}`}
            </p>
            <p className="truncate text-text-muted">{messageSnippet(banner)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (editing) {
                setDraft(drafts.get(roomId) ?? '');
                onCancelEdit();
              } else onCancelReply();
            }}
            className="rounded p-0.5 text-text-muted hover:text-primary-900"
            aria-label={editing ? 'Cancel editing' : 'Cancel reply'}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-bg-subtle p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-14 rounded-md object-cover" />
          ) : (
            <FileText className="size-10 text-primary-700" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
            <p className="text-xs text-text-muted">{fileSize(file.size)} · add a caption below if you like</p>
          </div>
          <button type="button" onClick={() => setFile(null)} className="rounded p-1 text-text-muted hover:text-primary-900" aria-label="Remove attachment">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {!editing && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Choose a file to send"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mb-0.5 rounded-full p-2.5 text-text-muted hover:bg-bg-muted hover:text-primary-700"
              aria-label="Attach a picture or document"
              title="Attach a picture or document (5 MB max)"
            >
              <Paperclip className="size-5" />
            </button>
          </>
        )}
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <textarea
            ref={textRef}
            rows={1}
            value={draft}
            onChange={(e) => change(e.target.value)}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files)[0];
              if (pasted && !editing) {
                e.preventDefault();
                pickFile(pasted);
              }
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line. On phones the
              // keyboard's return key adds a line; the send button sends.
              const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
              if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
              if (e.key === 'Escape' && editing) {
                setDraft(drafts.get(roomId) ?? '');
                onCancelEdit();
              }
            }}
            placeholder={file ? 'Add a caption' : 'Type a message'}
            maxLength={4000}
            className="block max-h-40 w-full resize-none rounded-2xl border border-border bg-bg-muted px-4 py-2.5 text-sm leading-5 focus:border-primary-700 focus:bg-white focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || (!draft.trim() && !file)}
          className="mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-700 text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          aria-label={editing ? 'Save edit' : 'Send'}
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
