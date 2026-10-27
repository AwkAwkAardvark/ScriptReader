import { expect, it } from 'vitest';
import { applyActionVisibility } from './action-visibility';
import { buildReadingDocument } from './reading-document';
import { filterScript } from './script';
import { scriptFor, syntheticRecords } from './test/fixtures';

it('removes standalone cue rows without refilling context or changing grouping; preserves songs and inline directions', () => {
  const script = scriptFor(syntheticRecords.map(row => row.No === '2' ? { ...row, English: '(quietly) The gate is open.' } : row));
  const context = { before: 2, after: 1, includeNonDialogue: false, showKorean: true };
  const filtered = filterScript(script.records, { character: 'Ro', ...context });
  const full = buildReadingDocument(script, filtered, 'Ro', context);
  expect(applyActionVisibility(full, false)).toBe(full);
  const hidden = applyActionVisibility(full, true);
  const entries = hidden.blocks.flatMap(block => block.kind === 'passage' ? block.entries : [block.entry]);
  expect(entries.every(entry => entry.kind !== 'cue')).toBe(true);
  expect(entries.find(entry => entry.no === 2)?.english).toBe('(quietly) The gate is open.');
  expect(entries.some(entry => entry.kind === 'song')).toBe(true);
  expect(entries.some(entry => entry.kind === 'scene')).toBe(true);
  expect(entries.map(entry => entry.no)).toEqual(full.blocks.flatMap(block => block.kind === 'scene' ? [block.entry] : block.entries).filter(entry => entry.kind !== 'cue').map(entry => entry.no));
  expect(full.blocks.flatMap(block => block.kind === 'passage' ? block.entries : []).some(entry => entry.kind === 'cue')).toBe(true);
});
