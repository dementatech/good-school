'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play } from 'lucide-react';
import { PersonAvatar } from './ChatAvatar';
import { clock } from '@/lib/communications/format';
import type { Attachment, Person } from '@/lib/communications/types';

// Only one voice note plays at a time, across the whole page.
const PLAYING_EVENT = 'chat-voice-playing';
const SPEEDS = [1, 1.5, 2];

/** A fallback shape for notes with no stored waveform (e.g. a plain audio upload). */
function placeholderBars(seed: string, n = 48): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) | 0;
    return 20 + (Math.abs(h + i) % 70);
  });
}

export function VoiceNotePlayer({
  id,
  attachment,
  sender,
  mine,
  listened,
}: {
  id: string;
  attachment: Attachment;
  sender: Person | null;
  mine: boolean;
  /** Played before (by me) — the mic badge turns from accent to muted, as on WhatsApp. */
  listened?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [played, setPlayed] = useState(Boolean(listened));
  const [durationMs, setDurationMs] = useState(attachment.durationMs ?? 0);
  const bars = attachment.waveform && attachment.waveform.length > 0 ? attachment.waveform : placeholderBars(id);

  useEffect(() => {
    function onOther(e: Event) {
      if ((e as CustomEvent<string>).detail !== id) audioRef.current?.pause();
    }
    window.addEventListener(PLAYING_EVENT, onOther);
    return () => window.removeEventListener(PLAYING_EVENT, onOther);
  }, [id]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAYING_EVENT, { detail: id }));
    audio.playbackRate = speed;
    setLoading(true);
    try {
      await audio.play();
      setPlayed(true);
    } catch {
      // Autoplay rules or an unsupported format; the button just stays on play.
    } finally {
      setLoading(false);
    }
  }

  function seekTo(clientX: number) {
    const audio = audioRef.current;
    const el = barsRef.current;
    if (!audio || !el || !durationMs) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = (ratio * durationMs) / 1000;
    setPosition(ratio * durationMs);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = durationMs ? Math.min(1, position / durationMs) : 0;
  const filled = mine ? 'bg-white' : 'bg-primary-700';
  const empty = mine ? 'bg-white/40' : 'bg-primary-200';

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 py-0.5 sm:w-72">
      {!mine && (
        <span className="relative shrink-0">
          <PersonAvatar name={sender?.name ?? 'Voice note'} photoUrl={sender?.photoUrl} seed={sender?.userId} />
          <Mic
            className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-white p-0.5 ${played ? 'text-primary-700' : 'text-accent-dark'}`}
            aria-hidden
          />
        </span>
      )}

      <button
        type="button"
        onClick={() => void toggle()}
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${mine ? 'text-white hover:bg-white/15' : 'text-primary-700 hover:bg-primary-50'}`}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          ref={barsRef}
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(position / 1000)}
          aria-valuetext={`${clock(position)} of ${clock(durationMs)}`}
          className="relative flex h-8 cursor-pointer touch-none items-center gap-[2px]"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            seekTo(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekTo(e.clientX);
          }}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            if (e.key === 'ArrowRight') audio.currentTime = Math.min(durationMs / 1000, audio.currentTime + 5);
            if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              void toggle();
            }
          }}
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / bars.length < progress ? filled : empty}`}
              style={{ height: `${Math.max(12, h)}%` }}
            />
          ))}
          {/* The playhead dot, as on WhatsApp. */}
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${mine ? 'bg-white' : 'bg-primary-700'} ${
              played || playing ? '' : 'hidden'
            }`}
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className={`mt-0.5 flex items-center justify-between text-[11px] ${mine ? 'text-white/80' : 'text-text-muted'}`}>
          <span>{clock(playing || position > 0 ? position : durationMs)}</span>
          {(playing || position > 0) && (
            <button
              type="button"
              onClick={cycleSpeed}
              className={`rounded-full px-1.5 font-semibold ${mine ? 'bg-white/20' : 'bg-bg-muted'}`}
              aria-label={`Playback speed ${speed} times`}
            >
              {speed}×
            </button>
          )}
        </div>
      </div>

      {mine && (
        <span className="relative shrink-0">
          <PersonAvatar name={sender?.name ?? 'You'} photoUrl={sender?.photoUrl} seed={sender?.userId} />
          <Mic className="absolute -bottom-0.5 -left-0.5 size-4 rounded-full bg-white p-0.5 text-primary-700" aria-hidden />
        </span>
      )}

      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) => {
          // Browser recordings often report Infinity; keep the stored length then.
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0 && !attachment.durationMs) setDurationMs(d * 1000);
        }}
        className="hidden"
      />
    </div>
  );
}
