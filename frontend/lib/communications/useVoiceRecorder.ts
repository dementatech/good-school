'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Records a voice note with the browser's MediaRecorder and samples the
// microphone level ~12 times a second for the live waveform. Chrome, Firefox
// and Android record WebM/Opus; Safari and iPhone record MP4/AAC. Needs HTTPS
// (or localhost): browsers refuse the microphone anywhere else.

export const VOICE_BARS = 48;
export const MAX_VOICE_MS = 15 * 60_000;
const SAMPLE_MS = 80;

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused';

export interface VoiceNote {
  file: File;
  durationMs: number;
  /** VOICE_BARS bar heights, 0-100. */
  waveform: number[];
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Squeezes the level samples into `bars` bars, scaled so the loudest is 100. */
export function toWaveform(levels: number[], bars = VOICE_BARS): number[] {
  if (levels.length === 0) return Array(bars).fill(4);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * levels.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * levels.length) / bars));
    const slice = levels.slice(start, end);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const peak = Math.max(...out, 0.01);
  return out.map((v) => Math.max(4, Math.round((v / peak) * 100)));
}

export function voiceRecordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useVoiceRecorder(onError: (message: string) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  /** Recent levels (0-1), newest last, for the live waveform. */
  const [liveLevels, setLiveLevels] = useState<number[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const levelsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const finishRef = useRef<((note: VoiceNote | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    if (state !== 'idle') return false;
    if (!voiceRecordingSupported()) {
      onError("This browser can't record voice notes. Try the latest Chrome, Safari or Firefox.");
      return false;
    }
    setState('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setState('idle');
      const name = (err as DOMException)?.name;
      onError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Allow microphone access for this site to record a voice note (check the padlock or site settings).'
          : name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : "The microphone couldn't be started.",
      );
      return false;
    }

    const mime = pickMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream);
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    levelsRef.current = [];
    elapsedRef.current = 0;
    cancelledRef.current = false;
    setElapsedMs(0);
    setLiveLevels([]);

    // Level meter.
    let analyser: AnalyserNode | null = null;
    let buffer: Uint8Array<ArrayBuffer> | null = null;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      buffer = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
    } catch {
      analyser = null;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const finish = finishRef.current;
      finishRef.current = null;
      const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0];
      const durationMs = elapsedRef.current;
      const waveform = toWaveform(levelsRef.current);
      const cancelled = cancelledRef.current;
      cleanup();
      setState('idle');
      if (cancelled || chunksRef.current.length === 0 || durationMs < 500) {
        finish?.(null);
        return;
      }
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `voice-note.${extensionFor(type)}`, { type });
      finish?.({ file, durationMs, waveform });
    };

    recorder.start(250);
    lastTickRef.current = performance.now();
    setState('recording');

    timerRef.current = setInterval(() => {
      const now = performance.now();
      if (recorderRef.current?.state === 'recording') {
        elapsedRef.current += now - lastTickRef.current;
        let level = 0;
        if (analyser && buffer) {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128;
            sum += v * v;
          }
          // RMS, lifted so quiet speech still shows.
          level = Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
        }
        levelsRef.current.push(level);
        setElapsedMs(elapsedRef.current);
        setLiveLevels((prev) => [...prev.slice(-59), level]);
        if (elapsedRef.current >= MAX_VOICE_MS) recorderRef.current?.stop();
      }
      lastTickRef.current = now;
    }, SAMPLE_MS);
    return true;
  }, [state, onError, cleanup]);

  /** Stops and hands back the note, or null if it was too short or cancelled. */
  const stop = useCallback((): Promise<VoiceNote | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      finishRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      lastTickRef.current = performance.now();
      setState('recording');
    }
  }, []);

  return { state, elapsedMs, liveLevels, start, stop, cancel, pause, resume };
}
