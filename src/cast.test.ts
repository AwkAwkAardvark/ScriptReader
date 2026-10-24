import { describe, expect, it } from 'vitest';
import { parseCast } from './cast';
import { attribution, filterScript, parseScript } from './script';
import { csvFor, syntheticRecords } from './test/fixtures';

const cast = [{ tag: 'Ro', label: 'Rowan Reed' }, { tag: 'Mi', label: 'Mira Moss' }];

describe('cast CSV validation', () => {
  it('reads explicit identifiers and Unicode names in source order, independently of script rows', () => {
    expect(parseCast('\uFEFFTag,Name\r\nMi,미라\r\nRo,"Rowan, the keeper"\r\n'))
      .toEqual({ ok: true, characters: [{ tag: 'Mi', label: '미라' }, { tag: 'Ro', label: 'Rowan, the keeper' }] });
  });
  it.each(['', 'Name,Tag\nMira,Mi', 'Tag,Tag\nMi,Mi', 'Tag,Name,Extra\nMi,Mira,x'])('rejects unsupported headers: %s', text => {
    const result = parseCast(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ document: 'cast', recordNumber: 1 });
  });
  it.each([
    ['Tag,Name', 1, 'no characters'],
    ['Tag,Name\n,Mira', 2, 'individual tag'],
    ['Tag,Name\nMi,', 2, 'name is required'],
    ['Tag,Name\nMi,   ', 2, 'name is required'],
    ['Tag,Name\nM i,Mira', 2, 'individual tag'],
    ['Tag,Name\nMi;Ro,Both', 2, 'individual tag'],
    ['Tag,Name\n"Mi,Ro",Both', 2, 'individual tag'],
    ['Tag,Name\nMi,Mira,extra', 2, 'Expected 2 fields'],
    ['Tag,Name\nMi,Mira\n\nRo,Rowan', 3, 'Expected 2 fields'],
    ['Tag,Name\nMi,Mira\nMi,Mira', 3, 'Duplicate cast tag'],
    ['Tag,Name\nMi,Mira\nMi,Someone else', 3, 'Duplicate cast tag'],
  ])('reports record-specific roster errors', (text, recordNumber, message) => {
    const result = parseCast(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ document: 'cast', recordNumber, message: expect.stringContaining(message) }));
  });
  it('rejects malformed quotes and counts logical records after multiline names', () => {
    expect(parseCast('Tag,Name\nMi,"unterminated').ok).toBe(false);
    const result = parseCast('Tag,Name\nMi,"Mira\nMoss"\nRo,');
    if (result.ok) throw new Error('Expected a missing name');
    expect(result.errors).toContainEqual(expect.objectContaining({ recordNumber: 3, field: 'Name' }));
  });
  it('allows equal display names for distinct identities and trims separator whitespace only', () => {
    expect(parseCast('Tag,Name\n Ro ,Keeper\nMi,Keeper')).toEqual({ ok: true, characters: [{ tag: 'Ro', label: 'Keeper' }, { tag: 'Mi', label: 'Keeper' }] });
  });
});

describe('script plus explicit cast', () => {
  it('uses roster names and ordering without modifying source role labels or text', () => {
    const source = csvFor();
    const result = parseScript(source, [...cast].reverse());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.script.identitySource).toBe('cast');
    expect(result.script.characters).toEqual([...cast].reverse());
    expect(result.script.records[1].source).toEqual(syntheticRecords[1]);
    expect(attribution(result.script.records[1], result.script)).toBe('Rowan Reed');
  });
  it('supports action-only characters and includes them without inventing a dialogue identity', () => {
    const records = syntheticRecords.map((row, index) => index === 2 ? { ...row, Tag: 'Sp' } : row);
    const result = parseScript(csvFor(records), [...cast, { tag: 'Sp', label: 'Silent Sprite' }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(filterScript(result.script.records, { character: 'Sp', before: 0, after: 0, includeNonDialogue: false }).items).toEqual([]);
    const on = filterScript(result.script.records, { character: 'Sp', before: 0, after: 0, includeNonDialogue: true });
    expect(on.items.map(item => item.record.no)).toEqual([1, 3, 9]);
    expect(attribution(result.script.records[2], result.script)).toBe('Silent Sprite');
  });
  it('supports group-only participation without deriving an identity from a plural label', () => {
    const records = syntheticRecords.map((row, index) => index === 3 ? { ...row, Role: 'The keepers', Tag: 'Mi; Sp' } : row);
    const result = parseScript(csvFor(records), [...cast, { tag: 'Sp', label: 'Silent Sprite' }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(attribution(result.script.records[3], result.script)).toBe('The keepers');
    expect(result.script.characters.some(character => character.label === 'The keepers')).toBe(false);
  });
  it('resolves blank single and group speaker labels from the cast, but never changes source cells', () => {
    const records = syntheticRecords.map((row, index) => index === 3 ? { ...row, Role: '', Tag: 'Mi;Ro' } : index === 1 ? { ...row, Role: '' } : row);
    const result = parseScript(csvFor(records), cast);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(attribution(result.script.records[1], result.script)).toBe('Rowan Reed');
    expect(attribution(result.script.records[3], result.script)).toBe('Mira Moss, Rowan Reed');
    expect(result.script.records[3].source.Role).toBe('');
    const untagged = records.map((row, index) => index === 3 ? { ...row, Tag: '' } : row);
    expect(parseScript(csvFor(untagged), cast).ok).toBe(false);
  });
  it('does not treat role aliases as identity conflicts when a roster is authoritative', () => {
    const records = syntheticRecords.map((row, index) => index === 3 ? { ...row, Role: 'Mira in disguise' } : row);
    expect(parseScript(csvFor(records)).ok).toBe(false);
    expect(parseScript(csvFor(records), cast).ok).toBe(true);
  });
  it('keeps unlabeled group directions compact rather than listing the whole participating cast', () => {
    const records = syntheticRecords.map((row, index) => index === 2 ? { ...row, Tag: 'Mi; Ro' } : row);
    const result = parseScript(csvFor(records), cast);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(attribution(result.script.records[2], result.script)).toBe('');
  });
  it('reports unknown or case-mismatched script tokens at the script record, not the roster', () => {
    for (const token of ['Sp', 'mi']) {
      const records = syntheticRecords.map((row, index) => index === 3 ? { ...row, Tag: token } : row);
      const result = parseScript(csvFor(records), cast);
      if (result.ok) throw new Error('Expected an unknown tag');
      expect(result.errors).toContainEqual(expect.objectContaining({ document: 'script', recordNumber: 5, field: 'Tag', message: `Character token ${token} is missing from the cast roster.` }));
    }
  });
  it('permits unused roster entries and keeps them selectable without fabricating participation', () => {
    const result = parseScript(csvFor(), [...cast, { tag: 'Sp', label: 'Silent Sprite' }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.script.characters).toHaveLength(3);
    expect(filterScript(result.script.records, { character: 'Sp', before: 10, after: 10, includeNonDialogue: true }).items).toEqual([]);
  });
  it('keeps record validation active in roster mode and preserves legacy identity validation without a cast', () => {
    const bad = syntheticRecords.map((row, index) => index === 3 ? { ...row, Type: 'Unknown' } : row);
    expect(parseScript(csvFor(bad), cast).ok).toBe(false);
    const unknown = syntheticRecords.map((row, index) => index === 2 ? { ...row, Tag: 'Sp' } : row);
    expect(parseScript(csvFor(unknown)).ok).toBe(false);
    const result = parseScript(csvFor());
    if (!result.ok) throw new Error('Expected legacy input to remain supported');
    expect(result.script.identitySource).toBe('script');
    expect(attribution(result.script.records[1], result.script)).toBe('Rowan');
  });
  it('does not change filtering, order, deduplication or song/scene boundaries', () => {
    const legacy = parseScript(csvFor());
    const explicit = parseScript(csvFor(), cast);
    if (!legacy.ok || !explicit.ok) throw new Error('Expected valid inputs');
    for (const character of ['Mi', 'Ro']) for (const before of [0, 1, 3, 10]) for (const after of [0, 1, 3, 10]) for (const includeNonDialogue of [false, true]) {
      const options = { character, before, after, includeNonDialogue };
      expect(filterScript(explicit.script.records, options)).toEqual(filterScript(legacy.script.records, options));
    }
  });
});
