import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DEFAULT_PAUSE_DURATION,
  DEFAULT_STATE,
  DEFAULT_TONE_DURATION,
  MAX_PAUSE_DURATION,
  MAX_TONE_DURATION,
  MIN_PAUSE_DURATION,
  MIN_TONE_DURATION,
  type DtmfKey,
  type ScheduledTone,
  type ToolState,
  type TonePairRow,
} from './types';

/** Standard DTMF low frequencies (rows of the keypad grid). */
export const LOW_FREQUENCIES = [697, 770, 852, 941] as const;
/** Standard DTMF high frequencies (columns of the keypad grid). */
export const HIGH_FREQUENCIES = [1209, 1336, 1477, 1633] as const;

/** Keypad grid layout: low-frequency rows x high-frequency columns. */
export const KEYPAD_MATRIX: readonly (readonly (DtmfKey | null)[])[] = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

export const DTMF_KEYS: readonly DtmfKey[] = KEYPAD_MATRIX.flat().filter(
  (k): k is DtmfKey => k !== null
);

/** Map every DTMF key to its exact tone-pair frequencies. */
export function buildTonePairTable(): TonePairRow[] {
  const rows: TonePairRow[] = [];
  for (let r = 0; r < KEYPAD_MATRIX.length; r++) {
    for (let c = 0; c < (KEYPAD_MATRIX[r]?.length ?? 0); c++) {
      const key = KEYPAD_MATRIX[r]?.[c];
      if (!key) continue;
      rows.push({
        key,
        lowFrequency: LOW_FREQUENCIES[r] as number,
        highFrequency: HIGH_FREQUENCIES[c] as number,
        lowLabel: `${LOW_FREQUENCIES[r]} Hz`,
        highLabel: `${HIGH_FREQUENCIES[c]} Hz`,
      });
    }
  }
  return rows;
}

export const TONE_PAIR_TABLE: TonePairRow[] = buildTonePairTable();

const TONE_PAIR_BY_KEY = new Map<string, TonePairRow>(TONE_PAIR_TABLE.map((row) => [row.key, row]));

/** True when the character is a valid DTMF key. */
export function isDtmfKey(char: string): char is DtmfKey {
  return TONE_PAIR_BY_KEY.has(char);
}

/**
 * Decode one DTMF tone pair to its key/symbol. Returns null when either
 * frequency is not part of the standard DTMF frequency set.
 */
export function decodeTonePair(lowFrequency: number, highFrequency: number): DtmfKey | null {
  const lowIndex = LOW_FREQUENCIES.indexOf(lowFrequency as (typeof LOW_FREQUENCIES)[number]);
  const highIndex = HIGH_FREQUENCIES.indexOf(highFrequency as (typeof HIGH_FREQUENCIES)[number]);
  if (lowIndex === -1 || highIndex === -1) return null;
  return KEYPAD_MATRIX[lowIndex]?.[highIndex] ?? null;
}

/**
 * Sanitize a dial string: keep only valid DTMF keys, dropping separators
 * (spaces, dashes) and any other invalid character.
 */
export function sanitizeSequence(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((char) => isDtmfKey(char))
    .join('');
}

/**
 * Parse a dial string into scheduled tones: each valid key gets a tone with
 * the configured duration, separated by the configured pause. Invalid
 * characters are skipped. `toneDuration`/`pauseDuration` fall back to
 * defaults when out of range.
 */
export function scheduleTones(
  sequence: string,
  toneDuration: number,
  pauseDuration: number
): ScheduledTone[] {
  const tone = clampDuration(
    toneDuration,
    MIN_TONE_DURATION,
    MAX_TONE_DURATION,
    DEFAULT_TONE_DURATION
  );
  const pause = clampDuration(
    pauseDuration,
    MIN_PAUSE_DURATION,
    MAX_PAUSE_DURATION,
    DEFAULT_PAUSE_DURATION
  );
  const tones: ScheduledTone[] = [];
  let cursor = 0;
  for (const char of sequence.toUpperCase()) {
    const row = TONE_PAIR_BY_KEY.get(char);
    if (!row) continue;
    tones.push({
      key: row.key,
      lowFrequency: row.lowFrequency,
      highFrequency: row.highFrequency,
      start: cursor,
      duration: tone,
    });
    cursor += tone + pause;
  }
  return tones;
}

function clampDuration(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Total playback length in milliseconds (last tone end). */
export function playbackDuration(tones: ScheduledTone[]): number {
  if (tones.length === 0) return 0;
  const last = tones[tones.length - 1];
  if (!last) return 0;
  return last.start + last.duration;
}

/** Clamp and normalize tone duration into the allowed range. */
export function clampToneDuration(value: number): number {
  return clampDuration(value, MIN_TONE_DURATION, MAX_TONE_DURATION, DEFAULT_TONE_DURATION);
}

/** Clamp and normalize pause duration into the allowed range. */
export function clampPauseDuration(value: number): number {
  return clampDuration(value, MIN_PAUSE_DURATION, MAX_PAUSE_DURATION, DEFAULT_PAUSE_DURATION);
}

export const dtmfTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  serialize: (state) => JSON.stringify(state),
  deserialize: (data): DeserializeResult<ToolState> => {
    if (typeof data !== 'object' || data === null) {
      return { success: false, error: 'Invalid data format: expected DTMF dial pad state object' };
    }
    const v = data as Partial<ToolState>;
    // Sequence may be legacy/foreign data: sanitize rather than reject.
    const sequence = typeof v.sequence === 'string' ? sanitizeSequence(v.sequence) : '';
    const toneDuration =
      typeof v.toneDuration === 'number' && Number.isFinite(v.toneDuration)
        ? clampToneDuration(v.toneDuration)
        : DEFAULT_TONE_DURATION;
    const pauseDuration =
      typeof v.pauseDuration === 'number' && Number.isFinite(v.pauseDuration)
        ? clampPauseDuration(v.pauseDuration)
        : DEFAULT_PAUSE_DURATION;
    return { success: true, data: { sequence, toneDuration, pauseDuration } };
  },
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
