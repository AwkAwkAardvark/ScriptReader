import { expect, it } from 'vitest';
import { filterScript } from './script';
import { buildReadingDocument } from './reading-document';
import { applyActionVisibility } from './action-visibility';
import { buildFocusedTeacherDocument, buildTeacherDocument } from './teacher-document';
import { scriptFor, syntheticRecords } from './test/fixtures';
import type { Assignment } from './assignments';

const entries = (document: ReturnType<typeof buildTeacherDocument>) => document.blocks.flatMap(b => b.kind === 'scene' ? [b.entry] : b.entries);
it('matches the student passage pipeline across contexts, cues, songs, scenes and shared contributions', () => {
 const script = scriptFor(syntheticRecords.map(r => r.No === '4' ? { ...r, Tag: 'Ro;Mi', Role: 'Together' } : r.No === '2' ? { ...r, English: '(quietly) The gate is open.' } : r));
 for (const character of ['Ro', 'Mi']) for (const before of [0, 1, 3, 5]) for (const after of [0, 1, 5]) for (const hide of [false, true]) for (const showKorean of [false, true]) {
  const context = { before, after, includeNonDialogue: !hide, showKorean };
  const student = applyActionVisibility(buildReadingDocument(script, filterScript(script.records, { character, ...context }), character, context), hide);
  const focused = buildFocusedTeacherDocument(script, character, context, showKorean, hide);
  expect(focused.blocks).toEqual(student.blocks);
  for (const entry of entries(focused)) expect(entry.tags).toEqual(script.records.find(r => r.no === entry.no)?.tags);
 }
 const focused = buildFocusedTeacherDocument(script, 'Ro', { before: 0, after: 0 }, true, true);
 expect(entries(focused).find(e => e.no === 4)?.highlighted).toBe(true);
 expect(entries(focused).find(e => e.no === 2)?.english).toContain('(quietly)');
 expect(entries(focused).every(e => e.kind !== 'cue')).toBe(true);
});
it('uses the same song overlap merging and action-only/empty-role semantics', () => {
 const script = scriptFor();
 const focused = buildFocusedTeacherDocument(script, 'Ro', { before: 0, after: 0 }, false, false);
 const windows = focused.blocks.filter(b => b.kind === 'passage');
 expect(windows.some(b => b.entries.some(e => e.no === 8) && b.entries.some(e => e.no === 9) && b.entries.some(e => e.no === 10))).toBe(true);
 const actionOnly = { ...script, characters: [...script.characters, { tag: 'Act1', label: 'Action One' }, { tag: 'Nil1', label: 'Empty role' }], records: script.records.map(r => r.no === 16 ? { ...r, tags: ['Act1'] } : r) };
 expect(entries(buildFocusedTeacherDocument(actionOnly, 'Act1', { before: 0, after: 0 }, true, false)).some(e => e.no === 16)).toBe(true);
 expect(buildFocusedTeacherDocument(actionOnly, 'Act1', { before: 5, after: 5 }, true, true).blocks).toEqual([]);
 expect(buildFocusedTeacherDocument(actionOnly, 'Nil1', { before: 5, after: 5 }, true, false).blocks).toEqual([]);
});
it('preserves full-script membership and rehearsal emphasis in All roles', () => {
 const script = scriptFor(); const rows: Assignment[] = [{ studentId: 's1', studentName: '김민준', className: 'EPG', tag: 'Ro', performance: '1부' }];
 const document = buildTeacherDocument(script, rows, { performance: '1부', classes: ['EPG'] }, true);
 expect(entries(document).map(e => e.no)).toEqual(script.records.map(r => r.no));
 expect(entries(document).find(e => e.no === 2)?.highlighted).toBe(true);
});

it('merges context for multiple roles in source order without duplicating shared lines', () => {
 const script = scriptFor(syntheticRecords.map(r => r.No === '4' ? { ...r, Tag: 'Ro;Mi', Role: 'Together' } : r));
 const document = buildFocusedTeacherDocument(script, ['Ro', 'Mi'], { before: 1, after: 1 }, true, false);
 const visible = entries(document);
 expect(visible.filter(entry => entry.no === 4)).toHaveLength(1);
 expect(visible.filter(entry => [2, 4, 7].includes(entry.no)).map(entry => entry.highlighted)).toEqual([true, true, true]);
 const first = document.blocks.find(block => block.kind === 'passage');
 expect(first?.kind === 'passage' && first.entries.map(entry => entry.no)).toEqual(Array.from({ length: 12 }, (_, index) => index + 2));
});
