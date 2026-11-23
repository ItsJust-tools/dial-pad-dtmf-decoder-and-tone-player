import type { ScheduledTone } from './types';

/**
 * Minimal Web Audio playback engine for DTMF tones.
 * Client-side only; works fully offline. Each tone is the sum of two sine
 * oscillators (low + high frequency), started at the tone's scheduled offset.
 */
export interface DtmfPlaybackHandle {
  /** Cancel all scheduled tones. */
  stop: () => void;
  /** Register a callback fired on each tone start (for key highlight). */
  onToneStart: (listener: (tone: ScheduledTone, index: number) => void) => void;
  /** Resolved when all tones have finished or playback is stopped. */
  finished: Promise<void>;
}

export interface StartPlaybackOptions {
  tones: ScheduledTone[];
  /** Master gain 0-1. Defaults to a modest 0.15 to avoid clipping. */
  volume?: number;
  /** AudioContext factory override (useful for tests). */
  createAudioContext?: () => AudioContext;
}

export const DEFAULT_DTMF_VOLUME = 0.15;

export function defaultCreateAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not supported in this browser');
  return new Ctor();
}

/** Schedule all DTMF tones on a fresh AudioContext and return a handle. */
export function startDtmfPlayback({
  tones,
  volume = DEFAULT_DTMF_VOLUME,
  createAudioContext = defaultCreateAudioContext,
}: StartPlaybackOptions): DtmfPlaybackHandle {
  const audioContext = createAudioContext();
  const listeners = new Set<(tone: ScheduledTone, index: number) => void>();
  const stopped = { current: false };
  const oscillators: OscillatorNode[] = [];
  const timers: number[] = [];

  const notify = (tone: ScheduledTone, index: number) => {
    for (const listener of listeners) listener(tone, index);
  };

  const finished = (async () => {
    await audioContext.resume().catch(() => undefined);
    if (stopped.current) return;
    const masterGain = audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioContext.destination);

    const baseTime = audioContext.currentTime;
    let maxEnd = baseTime;

    tones.forEach((tone, index) => {
      if (stopped.current) return;
      const startAt = baseTime + tone.start / 1000;
      const endAt = startAt + tone.duration / 1000;
      maxEnd = Math.max(maxEnd, endAt);

      const startTimer = window.setTimeout(
        () => {
          if (!stopped.current) notify(tone, index);
        },
        Math.max(0, tone.start)
      );
      timers.push(startTimer);

      for (const frequency of [tone.lowFrequency, tone.highFrequency]) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const gain = audioContext.createGain();
        // Short attack/release ramps avoid clicks.
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(volume, startAt + 0.005);
        gain.gain.setValueAtTime(volume, Math.max(startAt + 0.005, endAt - 0.005));
        gain.gain.linearRampToValueAtTime(0, endAt);
        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(startAt);
        oscillator.stop(endAt);
        oscillators.push(oscillator);
      }
    });

    const remainMs = Math.max(0, (maxEnd - audioContext.currentTime) * 1000);
    if (!stopped.current && tones.length > 0) {
      const endTimer = window.setTimeout(() => {
        if (!stopped.current) {
          void audioContext.close().catch(() => undefined);
        }
      }, remainMs + 50);
      timers.push(endTimer);
      await new Promise<void>((resolve) => window.setTimeout(resolve, remainMs));
    }
    if (stopped.current) {
      void audioContext.close().catch(() => undefined);
    }
  })();

  const stop = () => {
    stopped.current = true;
    for (const id of timers) window.clearTimeout(id);
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // already stopped
      }
    }
    void audioContext.close().catch(() => undefined);
  };

  return {
    stop,
    onToneStart: (listener) => {
      listeners.add(listener);
    },
    finished,
  };
}
