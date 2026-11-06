'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronUp, FileText, Lock, Mic, Paperclip, Pause, Pencil, Reply, Send, Trash2, X } from 'lucide-react';
import { useVoiceRecorder, voiceRecordingSupported } from '@/lib/communications/useVoiceRecorder';
import { clock } from '@/lib/communications/format';
import { fileSize, messageSnippet } from '@/lib/communications/format';
import type { ChatMessage } from '@/lib/communications/types';

const ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
const MAX_BYTES = 5 * 1024 * 1024;
/** Slide this far left while holding to cancel, this far up to lock. */
const CANCEL_DISTANCE = 110;
const LOCK_DISTANCE = 70;
/** A press shorter than this is a tap: recording starts hands-free. */
const TAP_MS = 350;

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
  onSend: (body: string, file: File | null, voice?: { durationMs: number; waveform: number[] } | null) => Promise<boolean>;
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

  // ── Voice notes ───────────────────────────────────────────────────────
  const recorder = useVoiceRecorder(onError);
  const [recordMode, setRecordMode] = useState<'off' | 'holding' | 'locked'>('off');
  const [slide, setSlide] = useState({ x: 0, y: 0 });
  const pressRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const [canRecord] = useState(() => voiceRecordingSupported());
  const recording = recordMode !== 'off';
  const showMic = !editing && canRecord && (recording || (!draft.trim() && !file));

  async function finishRecording(send: boolean) {
    setRecordMode('off');
    setSlide({ x: 0, y: 0 });
    if (!send) {
      recorder.cancel();
      return;
    }
    const note = await recorder.stop();
    if (!note) return; // Under half a second: treated as a slip, like WhatsApp.
    if (note.file.size > MAX_BYTES) {
      onError('That voice message is too long to send. Keep it under about 15 minutes.');
      return;
    }
    setBusy(true);
    await onSend('', note.file, { durationMs: note.durationMs, waveform: note.waveform });
    setBusy(false);
  }

  async function onMicDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || recording) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressRef.current = { x: e.clientX, y: e.clientY, at: Date.now() };
    setSlide({ x: 0, y: 0 });
    setRecordMode('holding');
    const started = await recorder.start();
    // Microphone refused, or the finger lifted before it was ready.
    if (!started) setRecordMode('off');
  }

  function onMicMove(e: React.PointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (recordMode !== 'holding' || !press) return;
    const x = Math.max(0, press.x - e.clientX);
    const y = Math.max(0, press.y - e.clientY);
    setSlide({ x: Math.min(x, CANCEL_DISTANCE), y });
    if (x >= CANCEL_DISTANCE) {
      pressRef.current = null;
      void finishRecording(false);
    } else if (y >= LOCK_DISTANCE) {
      pressRef.current = null;
      setSlide({ x: 0, y: 0 });
      setRecordMode('locked');
    }
  }

  function onMicUp() {
    const press = pressRef.current;
    pressRef.current = null;
    if (recordMode !== 'holding' || !press) return;
    if (Date.now() - press.at < TAP_MS) {
      // A tap: keep recording hands-free, with delete / pause / send.
      setSlide({ x: 0, y: 0 });
      setRecordMode('locked');
    } else void finishRecording(true);
  }

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
        {recording ? (
          <RecordingStrip
            locked={recordMode === 'locked'}
            paused={recorder.state === 'paused'}
            elapsedMs={recorder.elapsedMs}
            levels={recorder.liveLevels}
            slideX={slide.x}
            onDelete={() => {
              recorder.cancel();
              setRecordMode('off');
            }}
            onPauseToggle={() => (recorder.state === 'paused' ? recorder.resume() : recorder.pause())}
          />
        ) : (
          <>
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
          </>
        )}

        {showMic ? (
          <div className="relative mb-0.5 shrink-0">
            {recordMode === 'holding' && (
              <span
                className="pointer-events-none absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-white px-2 py-2 text-text-muted shadow-lg ring-1 ring-border"
                style={{ transform: `translate(-50%, ${-Math.min(slide.y, LOCK_DISTANCE) / 2}px)` }}
                aria-hidden
              >
                <Lock className="size-4" />
                <ChevronUp className="size-4 animate-bounce" />
              </span>
            )}
            {recordMode === 'locked' ? (
              <button
                type="button"
                onClick={() => void finishRecording(true)}
                disabled={busy}
                className="inline-flex size-10 items-center justify-center rounded-full bg-primary-700 text-white hover:bg-primary-800 disabled:opacity-40"
                aria-label="Send voice message"
              >
                <Send className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={onMicDown}
                onPointerMove={onMicMove}
                onPointerUp={onMicUp}
                onPointerCancel={() => {
                  if (recordMode === 'holding') {
                    recorder.cancel();
                    setRecordMode('off');
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
                className={`inline-flex touch-none select-none items-center justify-center rounded-full text-white transition-all ${
                  recordMode === 'holding' ? 'size-14 -m-2 bg-error shadow-lg' : 'size-10 bg-primary-700 hover:bg-primary-800'
                }`}
                style={recordMode === 'holding' ? { transform: `translate(${-slide.x}px, ${-Math.min(slide.y, LOCK_DISTANCE)}px)` } : undefined}
                aria-label="Record a voice message. Hold to record, or tap to start and tap send when done."
                title="Hold to record a voice message. Tap to record hands-free."
              >
                <Mic className={recordMode === 'holding' ? 'size-6' : 'size-5'} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (!draft.trim() && !file)}
            className="mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-700 text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
            aria-label={editing ? 'Save edit' : 'Send'}
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function RecordingStrip({
  locked,
  paused,
  elapsedMs,
  levels,
  slideX,
  onDelete,
  onPauseToggle,
}: {
  locked: boolean;
  paused: boolean;
  elapsedMs: number;
  levels: number[];
  slideX: number;
  onDelete: () => void;
  onPauseToggle: () => void;
}) {
  // The newest 40 levels, scrolling in from the right.
  const bars = [...Array(Math.max(0, 40 - levels.length)).fill(0), ...levels.slice(-40)];
  return (
    <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl bg-bg-muted px-3 py-1.5" role="status" aria-live="polite">
      {locked && (
        <button type="button" onClick={onDelete} className="rounded-full p-1.5 text-error hover:bg-error-bg" aria-label="Delete recording">
          <Trash2 className="size-5" />
        </button>
      )}
      <span className={`size-2.5 shrink-0 rounded-full bg-error ${paused ? '' : 'animate-pulse'}`} aria-hidden />
      <span className="w-11 shrink-0 text-sm tabular-nums text-text-primary">{clock(elapsedMs)}</span>
      <span className="sr-only">{paused ? 'Recording paused' : 'Recording voice message'}</span>
      {locked ? (
        <>
          <span className="flex h-7 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
            {bars.map((level, i) => (
              <span
                key={i}
                className="flex-1 rounded-full bg-primary-700 transition-[height] duration-75"
                style={{ height: `${Math.max(10, level * 100)}%`, opacity: level ? 1 : 0.25 }}
              />
            ))}
          </span>
          <button
            type="button"
            onClick={onPauseToggle}
            className="rounded-full p-1.5 text-error hover:bg-error-bg"
            aria-label={paused ? 'Resume recording' : 'Pause recording'}
          >
            {paused ? <Mic className="size-5" /> : <Pause className="size-5" />}
          </button>
        </>
      ) : (
        <span
          className="flex flex-1 items-center justify-center gap-1 text-sm text-text-muted transition-opacity"
          style={{ opacity: Math.max(0.2, 1 - slideX / CANCEL_DISTANCE) }}
        >
          <ChevronLeft className="size-4 animate-pulse" /> Slide to cancel
        </span>
      )}
    </div>
  );
}
