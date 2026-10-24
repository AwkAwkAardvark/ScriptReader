import { describe, expect, it } from 'vitest';
import { filterScript, parseScript, type FilterOptions, type SourceRecord } from './script';
import { csvFor, scriptFor, syntheticRecords } from './test/fixtures';

const defaults: FilterOptions = { character: 'Mi', before: 0, after: 0, includeNonDialogue: false };
const filtered = (overrides: Partial<FilterOptions> = {}) => filterScript(scriptFor().records, { ...defaults, ...overrides });
const ids = (overrides: Partial<FilterOptions> = {}) => filtered(overrides).items.map(item => item.record.no);
const changed = (index: number, patch: Partial<SourceRecord>) => syntheticRecords.map((record, i) => i === index ? { ...record, ...patch } : record);

describe('CSV parsing and normalization', () => {
  it('preserves Unicode, quoted multiline cells, metadata, raw text and source order', () => {
    const script = scriptFor();
    expect(script.records).toHaveLength(20);
    expect(script.records[5].source.English).toBe('It says, "Follow the ticking."\nWhat could that mean?');
    expect(script.records[1].source.Korean).toBe('문이 열려 있어요.');
    expect(script.records[6].source.Optional).toBe('Y');
    expect(script.records[15].types).toEqual(['VFX', 'StageDirection']);
    expect(script.records[15].source.Type).toBe('VFX; StageDirection');
    expect(script.characters).toEqual([{ tag: 'Ro', label: 'Rowan' }, { tag: 'Mi', label: 'Mira' }]);
  });
  it('accepts a BOM and a terminal newline without creating a record', () => {
    const result = parseScript('\uFEFF' + csvFor() + '\r\n');
    expect(result.ok && result.script.records.length).toBe(20);
  });
  it('retains punctuation and significant text whitespace', () => {
    expect(scriptFor(changed(3, { English: '  “Wait…” <b>listen</b>  ', Notes: 'a note' })).records[3].source)
      .toMatchObject({ English: '  “Wait…” <b>listen</b>  ', Notes: 'a note' });
  });
  it('accepts legitimate blank fields and unassigned song tags', () => {
    const script = scriptFor();
    expect(script.records[8].tags).toEqual([]);
    expect(script.records[2].source.Role).toBe('');
    expect(script.records[11].tags).toEqual([]);
  });
  it('derives individual choices without turning a group label into a character', () => {
    const script = scriptFor(changed(7, { Type: 'Line', Role: 'Both friends', Tag: 'Ro; Mi' }));
    expect(script.characters).toHaveLength(2);
    expect(script.records[7].tags).toEqual(['Ro', 'Mi']);
  });
  it.each([
    ['No', '1', 'Duplicate'], ['No', '0', 'positive'], ['No', '1.5', 'positive'],
    ['No', '9007199254740992', 'safe'], ['Scene', 'one', 'positive'], ['Scene', '0', 'positive'],
    ['Type', '', 'Use only'], ['Type', 'Line; Unknown', 'Use only'], ['Type', 'Line;Line', 'Duplicate'],
    ['Tag', 'Mi;', 'distinct'], ['Tag', 'Mi;;Ro', 'distinct'], ['Tag', 'Mi;Mi', 'distinct'],
    ['Tag', 'M i', 'distinct'],
    ['Role', '', 'speaker'],
    ['English', ' ', 'required'], ['Optional', 'N', 'Y or blank'],
  ])('reports %s=%s at the original CSV record', (field, value, message) => {
    const result = parseScript(csvFor(changed(3, { [field]: value })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ recordNumber: 5, field, message: expect.stringContaining(message) })]));
  });
  it('reports a cue token without a dialogue identity at its source record', () => {
    const result = parseScript(csvFor(changed(4, { Tag: 'Unknown' })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ recordNumber: 6, field: 'Tag', message: expect.stringContaining('identify') }));
  });
  it('reports conflicting labels at the later record without guessing the intended name', () => {
    const result = parseScript(csvFor(changed(6, { Role: 'Different name' })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ recordNumber: 8, field: 'Role', message: expect.stringContaining('conflicting') }));
  });
  it('rejects reordered source identifiers even when they are unique', () => {
    const result = parseScript(csvFor(changed(3, { No: '30' })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ recordNumber: 6, field: 'No', message: expect.stringContaining('increasing') }));
  });
  it('reports logical CSV record numbers after an embedded newline', () => {
    const result = parseScript(csvFor(changed(6, { Scene: '-1' })));
    if (result.ok) throw new Error('Expected validation failure');
    expect(result.errors).toContainEqual(expect.objectContaining({ recordNumber: 8, field: 'Scene' }));
  });
  it('rejects unsupported, missing, duplicate and reordered headers', () => {
    for (const text of ['', csvFor().replace('No,Scene', 'Scene,No'), csvFor().replace('Optional', 'Extra'), csvFor().replace('Optional', 'Tag')]) {
      const result = parseScript(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].recordNumber).toBe(1);
    }
  });
  it('rejects a header without data, wrong field counts and interior blank records', () => {
    const text = csvFor();
    for (const malformed of [text.split('\r\n')[0], text + '\r\n1,2,3', text.replace('\r\n2,', '\r\n\r\n2,')]) expect(parseScript(malformed).ok).toBe(false);
  });
  it('rejects malformed CSV quotes', () => {
    expect(parseScript(csvFor() + '\r\n"unterminated').ok).toBe(false);
  });
});

describe('pure filtering', () => {
  it('supports zero context, structural context, optional rows and source ordering', () => {
    expect(ids()).toEqual([1, 4, 7, 9, 11]);
    expect(filtered().passageCount).toBe(4);
  });
  it('counts directions/effects and whole multiline records in asymmetric windows', () => {
    expect(ids({ before: 1, after: 0 })).toEqual([1, 3, 4, 6, 7, 9, 10, 11]);
    expect(ids({ before: 0, after: 1 })).toEqual([1, 4, 5, 7, 8, 9, 11, 12]);
  });
  it('shows non-dialogue in context with the participation toggle off', () => {
    const result = filtered({ before: 1, after: 1 });
    expect(result.items.map(item => item.record.no)).toContain(5);
    expect(result.items.find(item => item.record.no === 5)?.highlighted).toBe(true);
    expect(result.items.map(item => item.record.no)).not.toContain(13);
  });
  it('uses tagged non-dialogue as additional anchors only when enabled', () => {
    expect(ids({ includeNonDialogue: true })).toEqual([1, 4, 5, 7, 9, 11, 13, 14, 16, 17]);
    expect(ids()).not.toContain(16);
  });
  it('never crosses a song boundary or carries unused context beyond it', () => {
    expect(ids({ before: 50, after: 0 })).not.toContain(8);
    const rows = changed(6, { Tag: 'Ro', Role: 'Rowan' });
    const result = filterScript(scriptFor(rows).records, { ...defaults, after: 50 });
    expect(result.items.map(item => item.record.no)).toContain(8);
    expect(result.items.map(item => item.record.no)).not.toContain(10);
  });
  it('never crosses scene boundaries, even for very large windows', () => {
    expect(ids({ before: Number.MAX_SAFE_INTEGER, after: Number.MAX_SAFE_INTEGER })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it('merges overlapping and adjacent windows without duplicates', () => {
    const result = filtered({ before: 1, after: 1 });
    const numbers = result.items.map(item => item.record.no);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(result.passageCount).toBe(1);
    expect(result.items.filter(item => item.record.no === 9)).toHaveLength(1);
    expect(result.items.filter(item => item.record.no === 4 && item.highlighted)).toHaveLength(1);
  });
  it('includes a shared boundary song in one merged passage without changing selected rows', () => {
    const result = filtered({ before: 1, after: 1 });
    expect(result.items.map(item => item.record.no)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.items.find(item => item.record.no === 8)?.passage).toBe(result.items.find(item => item.record.no === 10)?.passage);
    expect(result.items.find(item => item.record.no === 9)?.passage).toBe(result.items.find(item => item.record.no === 8)?.passage);
  });
  it('does not merge across hidden rows just because a song is visible', () => {
    const result = filtered();
    const beforeSong = result.items.find(item => item.record.no === 7)!;
    const song = result.items.find(item => item.record.no === 9)!;
    const afterSong = result.items.find(item => item.record.no === 11)!;
    expect(song.passage).not.toBeNull();
    expect(song.passage).not.toBe(beforeSong.passage);
    expect(song.passage).not.toBe(afterSong.passage);
  });
  it('attaches a boundary song to a passage reaching only one side', () => {
    const result = filtered({ before: 0, after: 1 });
    expect(result.items.find(item => item.record.no === 9)?.passage).toBe(result.items.find(item => item.record.no === 8)?.passage);
    expect(result.items.find(item => item.record.no === 9)?.passage).not.toBe(result.items.find(item => item.record.no === 11)?.passage);
  });
  it('merges through consecutive songs once each but keeps scene groups separate', () => {
    const rows = changed(9, { Type: 'Song', Role: '', Tag: '' });
    const result = filterScript(scriptFor(rows).records, { ...defaults, before: 100, after: 100, includeNonDialogue: true });
    const sceneOne = result.items.filter(item => item.record.scene === 1 && !item.record.types.includes('Title'));
    expect(new Set(sceneOne.map(item => item.passage)).size).toBe(1);
    expect(sceneOne.filter(item => item.record.types.includes('Song'))).toHaveLength(2);
    const sceneTwo = result.items.filter(item => item.record.scene === 2 && !item.record.types.includes('Title'));
    expect(sceneTwo.every(item => item.passage !== sceneOne[0].passage)).toBe(true);
    expect(result.items.filter(item => item.record.no === 9)).toHaveLength(1);
  });
  it('matches exact individual tags in a group without expanding labels or aliases', () => {
    const script = scriptFor(changed(7, { Type: 'Line', Role: 'Both friends', Tag: 'Mi; Ro' }));
    expect(filterScript(script.records, defaults).items.map(item => item.record.no)).toContain(8);
    expect(filterScript(script.records, { ...defaults, character: 'M' }).items).toEqual([]);
    expect(filterScript(script.records, { ...defaults, character: 'EVERYONE' }).items).toEqual([]);
  });
  it('selects a synthetic tagged song alone with the toggle on, without surrounding context', () => {
    const script = scriptFor(changed(18, { Tag: 'Mi' }));
    const on = filterScript(script.records, { ...defaults, before: 99, after: 99, includeNonDialogue: true });
    expect(on.items.filter(item => item.record.scene === 3).map(item => item.record.no)).toEqual([18, 19]);
    expect(on.items.find(item => item.record.no === 19)?.highlighted).toBe(true);
    const off = filterScript(script.records, defaults);
    expect(off.items.some(item => item.record.scene === 3)).toBe(false);
  });
  it('is deterministic and does not mutate its input', () => {
    const script = scriptFor();
    const before = JSON.stringify(script);
    expect(filterScript(script.records, defaults)).toEqual(filterScript(script.records, defaults));
    expect(JSON.stringify(script)).toBe(before);
    expect(filterScript(script.records, { ...defaults, character: '' }).items).toEqual([]);
  });
  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid counts: %s', count => {
    expect(() => filtered({ before: count })).toThrow(RangeError);
    expect(() => filtered({ after: count })).toThrow(RangeError);
  });
});
