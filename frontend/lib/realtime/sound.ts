'use client';

// Synthesized rather than shipped as audio files — a couple of oscillator
// beeps are a fraction of a KB of code versus even a tiny .mp3, and it
// sidesteps ever needing to pick/license a sound. Lazily created: building
// an AudioContext before any user gesture on the page just leaves it
// 'suspended' until one happens, which is fine — resume() below unsticks it
// the next time a sound actually needs to play.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(audio: AudioContext, frequency: number, durationMs: number, delayMs = 0): void {
  const start = audio.currentTime + delayMs / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = frequency;
  osc.type = 'sine';
  // Ramp up/down rather than a hard on/off — avoids the audible "click" a
  // sudden gain jump makes.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
}

/** A single soft chime — the general notification feed (broadcasts, exam
 *  results published, ...). Best-effort: a browser blocking audio before any
 *  user gesture, or having no audio hardware, must never break the app. */
export function playNotificationSound(): void {
  try {
    const audio = getContext();
    if (audio) beep(audio, 880, 150);
  } catch {
    // Best-effort — see docstring above.
  }
}

/** Two quick ascending notes — audibly distinct from the notification
 *  chime, used only for an incoming direct message. */
export function playMessageSound(): void {
  try {
    const audio = getContext();
    if (!audio) return;
    beep(audio, 660, 90);
    beep(audio, 880, 90, 100);
  } catch {
    // Best-effort — see docstring above.
  }
}
