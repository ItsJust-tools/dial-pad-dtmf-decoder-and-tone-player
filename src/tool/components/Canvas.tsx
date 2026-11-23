'use client';

import React from 'react';
import { decodeTonePair, isDtmfKey, sanitizeSequence, TONE_PAIR_TABLE } from '../tool-definition';
import type { DtmfKey, ToolState } from '../types';

interface CanvasProps {
  state: ToolState;
  onChange: (state: ToolState) => void;
  activeKey?: DtmfKey | null;
  onPlaySequence?: () => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
  onCopySequence?: () => void;
  copyLabel?: string;
}

/** Standard 4x4 telephone keypad layout (1-9, *, 0, # on top of A-D columns). */
const KEYPAD_LAYOUT: readonly (readonly string[])[] = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

export const Canvas: React.FC<CanvasProps> = ({
  state,
  onChange,
  activeKey,
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onCopySequence,
  copyLabel = 'Copy',
}) => {
  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });

  const handleKeyPress = (key: string) => {
    update({ sequence: state.sequence + key });
  };

  const handleSequenceInput = (value: string) => {
    // Sanitize live: keep DTMF keys plus spacing separators the user types.
    const cleaned = value
      .toUpperCase()
      .split('')
      .filter((char) => isDtmfKey(char) || char === ' ' || char === '-')
      .join('');
    update({ sequence: cleaned });
  };

  const displaySequence =
    state.sequence.trim().length > 0 ? state.sequence : sanitizeSequence(state.sequence);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full" data-testid="dtmf-canvas">
      <section aria-label="Dial string">
        <label
          htmlFor="dtmf-sequence"
          className="text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
        >
          Dial string
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="dtmf-sequence"
            type="text"
            value={displaySequence}
            onChange={(e) => handleSequenceInput(e.target.value)}
            placeholder="e.g. 555-0198 or paste a sequence"
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-mono text-gray-900 dark:text-gray-100"
            data-testid="dtmf-sequence-input"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={isPlaying ? onStopPlayback : onPlaySequence}
            disabled={!isPlaying && state.sequence.length === 0}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            data-testid="dtmf-play"
          >
            {isPlaying ? 'Stop' : 'Play sequence'}
          </button>
          <button
            type="button"
            onClick={onCopySequence}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="dtmf-copy"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={() => update({ sequence: '' })}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="dtmf-clear"
          >
            Clear
          </button>
        </div>
      </section>

      <section aria-label="Phone keypad">
        <div className="grid grid-cols-4 gap-2 max-w-xs" data-testid="dtmf-keypad">
          {KEYPAD_LAYOUT.flatMap((rowKeys, rowIndex) =>
            rowKeys.map((key, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}-${key}`}
                type="button"
                onClick={() => handleKeyPress(key)}
                className={`rounded-lg border px-2 py-3 text-lg font-semibold transition-colors ${
                  activeKey === key
                    ? 'bg-emerald-600 text-white border-emerald-700 scale-95'
                    : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700'
                }`}
                data-testid={`dtmf-key-${key}`}
                aria-label={`Key ${key}`}
              >
                {key}
              </button>
            ))
          )}
        </div>
      </section>

      <section aria-label="DTMF tone reference">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Tone pairs
        </h3>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs" data-testid="dtmf-table">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th scope="col" className="py-1 pr-3">
                  Key
                </th>
                <th scope="col" className="py-1 pr-3">
                  Low (Hz)
                </th>
                <th scope="col" className="py-1 pr-3">
                  High (Hz)
                </th>
                <th scope="col" className="py-1">
                  Pair
                </th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {TONE_PAIR_TABLE.map((row) => (
                <tr
                  key={row.key}
                  className={activeKey === row.key ? 'bg-emerald-100 dark:bg-emerald-900' : ''}
                  data-testid={`dtmf-row-${row.key}`}
                >
                  <td className="py-1 pr-3 font-semibold">{row.key}</td>
                  <td className="py-1 pr-3">{row.lowFrequency}</td>
                  <td className="py-1 pr-3">{row.highFrequency}</td>
                  <td className="py-1">
                    {row.lowFrequency}+{row.highFrequency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Example: 697 Hz + 1209 Hz is the digit 1.{' '}
          {(() => {
            const example = decodeTonePair(941, 1477);
            return example ? `941 Hz + 1477 Hz is ${example}.` : '';
          })()}
        </p>
      </section>

      <section aria-label="Playback timing">
        <div className="flex flex-wrap gap-4">
          <div>
            <label
              htmlFor="dtmf-tone-duration"
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              Tone duration (ms)
            </label>
            <input
              id="dtmf-tone-duration"
              type="number"
              min={20}
              max={3000}
              value={state.toneDuration}
              onChange={(e) => update({ toneDuration: Number(e.target.value) })}
              className="mt-1 block w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
              data-testid="dtmf-tone-duration"
            />
          </div>
          <div>
            <label
              htmlFor="dtmf-pause-duration"
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              Pause between tones (ms)
            </label>
            <input
              id="dtmf-pause-duration"
              type="number"
              min={0}
              max={2000}
              value={state.pauseDuration}
              onChange={(e) => update({ pauseDuration: Number(e.target.value) })}
              className="mt-1 block w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
              data-testid="dtmf-pause-duration"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
