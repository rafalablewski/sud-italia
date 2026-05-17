"use client";

/**
 * Multi-tone KDS audio cues. Different events get different tonal
 * shapes so the line cook can identify what happened without looking:
 *
 *   - newOrder     : two rising notes (C5 → G5), warm
 *   - overdue      : low repeated pulse (A3 × 2), urgent
 *   - ready        : single chime (C6), bright
 *
 * Web Audio API needs a user gesture before the first AudioContext
 * resumes — call sites are expected to gate on the mute toggle (which
 * was a tap) so this is satisfied.
 */

type Cue = "newOrder" | "overdue" | "ready" | "test";

interface NoteSpec {
  freq: number;
  /** Start offset in seconds from cue start. */
  at: number;
  /** Duration in seconds. */
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<Cue, NoteSpec[]> = {
  newOrder: [
    { freq: 523.25, at: 0,    dur: 0.12, type: "triangle", gain: 0.16 }, // C5
    { freq: 783.99, at: 0.14, dur: 0.18, type: "triangle", gain: 0.16 }, // G5
  ],
  overdue: [
    { freq: 220, at: 0,    dur: 0.18, type: "sawtooth", gain: 0.14 }, // A3
    { freq: 220, at: 0.28, dur: 0.18, type: "sawtooth", gain: 0.14 },
  ],
  ready: [
    { freq: 1046.5, at: 0, dur: 0.22, type: "sine", gain: 0.18 }, // C6
  ],
  test: [
    { freq: 880, at: 0, dur: 0.16, type: "triangle", gain: 0.16 },
  ],
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    (window.AudioContext as typeof AudioContext | undefined) ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Play a KDS audio cue. No-op when audio is unavailable. */
export function playKdsCue(cue: Cue): void {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    // Resume requires a user gesture in some browsers; the call sites
    // gate on the unmute toggle, which counts as one. Ignore errors.
    audio.resume().catch(() => {});
  }
  const notes = CUES[cue];
  const now = audio.currentTime;
  for (const n of notes) {
    try {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = n.type ?? "triangle";
      o.frequency.value = n.freq;
      // Quick fade in + out so we don't get a click.
      const start = now + n.at;
      const end = start + n.dur;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(n.gain ?? 0.16, start + 0.01);
      g.gain.linearRampToValueAtTime(0, end);
      o.connect(g);
      g.connect(audio.destination);
      o.start(start);
      o.stop(end + 0.02);
    } catch {
      /* per-note failure shouldn't stop the rest of the cue */
    }
  }
}
