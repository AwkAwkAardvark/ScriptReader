import { describe, expect, it } from 'vitest';
import { buildReadingDocument } from './reading-document';
import { filterScript, parseScript } from './script';
import { csvFor, scriptFor } from './test/fixtures';

const context = { before: 3, after: 1, includeNonDialogue: false, showKorean: true };
describe('shared reading document', () => {
  it('contains exactly the filtered source order and text, with one copy of song boundaries', () => {
    const script = scriptFor();
    const filtered = filterScript(script.records, { character: 'Ro', ...context });
    const document = buildReadingDocument(script, filtered, 'Ro', context);
    const entries = document.blocks.flatMap(block => block.kind === 'scene' ? [block.entry] : block.entries);
    expect(entries.map(entry => entry.no)).toEqual(filtered.items.map(item => item.record.no));
    expect(entries.map(entry => entry.english)).toEqual(filtered.items.map(item => item.record.source.English));
    expect(entries.filter(entry => entry.no === 9)).toHaveLength(1);
    expect(document.blocks.some(block => block.kind === 'passage' && block.entries.some(entry => entry.kind === 'song'))).toBe(true);
    expect(document.context).toEqual(context);
    expect(document.character).toEqual({ tag: 'Ro', label: 'Rowan' });
    expect(document.sceneCount).toBe(3);
  });
  it('omits Korean entirely when disabled without altering the source', () => {
    const script = scriptFor();
    const filtered = filterScript(script.records, { character: 'Ro', ...context });
    const document = buildReadingDocument(script, filtered, 'Ro', { ...context, showKorean: false });
    expect(document.blocks.flatMap(block => block.kind === 'scene' ? [block.entry] : block.entries).every(entry => entry.korean === '')).toBe(true);
    expect(script.records[1].source.Korean).toBe('문이 열려 있어요.');
  });
  it('resolves roster identities for screen and print', () => {
    const parsed = parseScript(csvFor(), [{ tag: 'Ro', label: 'Rowan Reed' }, { tag: 'Mi', label: 'Mira Moss' }]);
    if (!parsed.ok) throw new Error('Fixture invalid');
    const filtered = filterScript(parsed.script.records, { character: 'Ro', ...context });
    const document = buildReadingDocument(parsed.script, filtered, 'Ro', context);
    expect(document.character.label).toBe('Rowan Reed');
    expect(document.blocks.flatMap(block => block.kind === 'scene' ? [] : block.entries).find(entry => entry.no === 2)?.speaker).toBe('Rowan Reed');
  });
  it('rejects unknown character selections', () => {
    const script = scriptFor();
    expect(() => buildReadingDocument(script, { items: [], passageCount: 0 }, 'missing', context)).toThrow('known character');
  });
});
