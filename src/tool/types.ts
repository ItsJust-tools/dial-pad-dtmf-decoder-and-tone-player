/** A key on the telephone keypad (columns 1-4 include the A-D letters). */
export type DtmfKey =
  '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | '*' | '#' | 'A' | 'B' | 'C' | 'D';

export interface ToolState {
  /** The current dial string: DTMF characters, optionally separated by spaces or dashes. */
  sequence: string;
  /** Duration of each tone in milliseconds (20-3000). */
  toneDuration: number;
  /** Pause between tones in milliseconds (0-2000). */
  pauseDuration: number;
}

export const DEFAULT_TONE_DURATION = 150;
export const DEFAULT_PAUSE_DURATION = 60;
export const MIN_TONE_DURATION = 20;
export const MAX_TONE_DURATION = 3000;
export const MIN_PAUSE_DURATION = 0;
export const MAX_PAUSE_DURATION = 2000;

export const DEFAULT_STATE: ToolState = {
  sequence: '',
  toneDuration: DEFAULT_TONE_DURATION,
  pauseDuration: DEFAULT_PAUSE_DURATION,
};

/** Reference-table row: a tone pair mapped to its digit/symbol plus labels. */
export interface TonePairRow {
  key: DtmfKey;
  lowFrequency: number;
  highFrequency: number;
  /** Human row group (frequency band of the low tone). */
  lowLabel: string;
  /** Human column group (frequency band of the high tone). */
  highLabel: string;
}

export interface ScheduledTone {
  key: DtmfKey;
  lowFrequency: number;
  highFrequency: number;
  /** Start offset in milliseconds from playback start. */
  start: number;
  /** Tone length in milliseconds. */
  duration: number;
}
