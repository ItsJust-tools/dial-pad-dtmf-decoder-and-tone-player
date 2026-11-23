import { describe, it, expect } from 'vitest';
import {
  TONE_PAIR_TABLE,
  LOW_FREQUENCIES,
  HIGH_FREQUENCIES,
  decodeTonePair,
  isDtmfKey,
  sanitizeSequence,
  scheduleTones,
  playbackDuration,
  clampToneDuration,
  clampPauseDuration,
  dtmfTool,
} from '@/tool/tool-definition';
import { DEFAULT_STATE, type ToolState } from '@/tool/types';

const EXPECTED_PAIRS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  A: [697, 1633],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  B: [770, 1633],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  C: [852, 1633],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
  D: [941, 1633],
};

describe('DTMF tone mapping', () => {
  it('maps every key 0-9, *, #, A-D to the correct frequency pair', () => {
    expect(TONE_PAIR_TABLE).toHaveLength(16);
    for (const [key, [low, high]] of Object.entries(EXPECTED_PAIRS)) {
      const row = TONE_PAIR_TABLE.find((r) => r.key === key);
      expect(row, `missing row for key ${key}`).toBeDefined();
      expect(row?.lowFrequency).toBe(low);
      expect(row?.highFrequency).toBe(high);
    }
  });

  it('covers 0-9, *, #, A-D exactly once', () => {
    const keys = TONE_PAIR_TABLE.map((r) => r.key).sort();
    expect(keys).toEqual([...Object.keys(EXPECTED_PAIRS)].sort());
    expect(new Set(keys).size).toBe(16);
  });

  it('uses each low frequency for exactly one row and each high frequency for one column', () => {
    const lows = TONE_PAIR_TABLE.map((r) => r.lowFrequency);
    const highs = TONE_PAIR_TABLE.map((r) => r.highFrequency);
    expect(new Set(lows)).toEqual(new Set(LOW_FREQUENCIES));
    expect(new Set(highs)).toEqual(new Set(HIGH_FREQUENCIES));
  });

  it('decodes tone pairs back to the right key', () => {
    for (const [key, [low, high]] of Object.entries(EXPECTED_PAIRS)) {
      expect(decodeTonePair(low, high)).toBe(key);
    }
  });

  it('returns null for invalid frequencies', () => {
    expect(decodeTonePair(697, 1200)).toBeNull();
    expect(decodeTonePair(700, 1209)).toBeNull();
    expect(decodeTonePair(0, 0)).toBeNull();
    expect(decodeTonePair(NaN, 1209)).toBeNull();
  });

  it('identifies valid and invalid key characters', () => {
    for (const key of Object.keys(EXPECTED_PAIRS)) {
      expect(isDtmfKey(key)).toBe(true);
    }
    expect(isDtmfKey('x')).toBe(false);
    expect(isDtmfKey('')).toBe(false);
    expect(isDtmfKey('E')).toBe(false);
  });
});

describe('sanitizeSequence', () => {
  it('keeps only valid DTMF keys', () => {
    expect(sanitizeSequence('12a34')).toBe('12A34');
    expect(sanitizeSequence('555-867-5309')).toBe('5558675309');
  });

  it('drops invalid characters and lowercases letters to uppercase', () => {
    expect(sanitizeSequence('1x2!3')).toBe('123');
    // 'z' is not a DTMF key so it must be dropped
    expect(sanitizeSequence('1z2')).toBe('12');
    expect(sanitizeSequence('a b c d')).toBe('ABCD');
  });

  it('returns empty string for input with no valid keys', () => {
    expect(sanitizeSequence('xyz')).toBe('');
    expect(sanitizeSequence('')).toBe('');
    expect(sanitizeSequence('!@#$%'.replace(/[0-9*#ABCD]/gi, ''))).toBe('');
  });
});

describe('scheduleTones', () => {
  const state = (sequence: string, toneDuration = 100, pauseDuration = 50): string =>
    ({
      ...DEFAULT_STATE,
      sequence,
      toneDuration,
      pauseDuration,
    }).sequence;

  it('schedules tones with correct start, duration, and pause values', () => {
    const tones = scheduleTones(state('123'), 100, 50);
    expect(tones).toHaveLength(3);
    expect(tones[0]).toMatchObject({
      key: '1',
      start: 0,
      duration: 100,
      lowFrequency: 697,
      highFrequency: 1209,
    });
    expect(tones[1]).toMatchObject({ key: '2', start: 150, duration: 100 });
    expect(tones[2]).toMatchObject({ key: '3', start: 300, duration: 100 });
  });

  it('uses zero pause between tones when pause is 0', () => {
    const tones = scheduleTones(state('90'), 80, 0);
    expect(tones[0]?.start).toBe(0);
    expect(tones[1]?.start).toBe(80);
  });

  it('skips separators and invalid characters', () => {
    const tones = scheduleTones(state('1-2 3!4'), 100, 50);
    expect(tones.map((t) => t.key)).toEqual(['1', '2', '3', '4']);
  });

  it('clamps out-of-range durations to ranges', () => {
    const tones = scheduleTones('5', 9999, -100);
    expect(tones[0]?.duration).toBe(3000); // clamped to MAX_TONE_DURATION
  });

  it('returns empty array for empty or invalid input', () => {
    expect(scheduleTones('', 100, 50)).toEqual([]);
    expect(scheduleTones('!!', 100, 50)).toEqual([]);
  });

  it('accepts lowercase letters as valid keys', () => {
    const tones = scheduleTones('abcd', 100, 50);
    expect(tones.map((t) => t.key)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('playbackDuration', () => {
  it('computes total length including final pause-free tail', () => {
    const tones = scheduleTones('12', 100, 50);
    expect(playbackDuration(tones)).toBe(250);
  });

  it('is zero for empty sequences', () => {
    expect(playbackDuration([])).toBe(0);
  });
});

describe('duration clamps', () => {
  it('clamps tone duration to 20-3000 ms', () => {
    expect(clampToneDuration(10)).toBe(20);
    expect(clampToneDuration(5000)).toBe(3000);
    expect(clampToneDuration(250)).toBe(250);
    expect(clampToneDuration(NaN)).toBe(150);
    expect(clampToneDuration(Infinity)).toBe(150);
  });

  it('clamps pause duration to 0-2000 ms', () => {
    expect(clampPauseDuration(-10)).toBe(0);
    expect(clampPauseDuration(5000)).toBe(2000);
    expect(clampPauseDuration(75)).toBe(75);
    expect(clampPauseDuration(NaN)).toBe(60);
  });
});

describe('dtmfTool serialize/deserialize', () => {
  it('round-trips valid state', () => {
    const state: ToolState = { sequence: '5550198', toneDuration: 200, pauseDuration: 40 };
    const serialized = dtmfTool.serialize(state);
    expect(serialized).toContain('"sequence":"5550198"');
    const result = dtmfTool.deserialize(JSON.parse(serialized));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(state);
    }
  });

  it('sanitizes invalid characters in stored sequence', () => {
    const result = dtmfTool.deserialize({
      sequence: '12x34',
      toneDuration: 100,
      pauseDuration: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sequence).toBe('1234');
    }
  });

  it('clamps out-of-range durations on deserialize', () => {
    const result = dtmfTool.deserialize({ sequence: '1', toneDuration: 99999, pauseDuration: -5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toneDuration).toBe(3000);
      expect(result.data.pauseDuration).toBe(0);
    }
  });

  it('falls back to defaults for missing/invalid fields', () => {
    const result = dtmfTool.deserialize({ nope: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(DEFAULT_STATE);
    }
  });

  it('rejects non-object data', () => {
    expect(dtmfTool.deserialize(null)).toEqual({
      success: false,
      error: 'Invalid data format: expected DTMF dial pad state object',
    });
    expect(dtmfTool.deserialize('abc').success).toBe(false);
    expect(dtmfTool.deserialize(42).success).toBe(false);
  });

  it('exposes the four image exporters plus metadata', async () => {
    expect(dtmfTool.id).toBe('1795244675');
    const exporters = dtmfTool.exporters ?? [];
    expect(exporters).toHaveLength(4);
    const png = await exporters[0]!.loader();
    const resolved = 'default' in png ? png.default : png.exporter;
    expect(resolved.format).toBe('png');
  });
});
