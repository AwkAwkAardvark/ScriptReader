import { readCsv, validTag, type Diagnostic } from './csv';
export type { Diagnostic } from './csv';

export const HEADERS = ['No', 'Scene', 'Role', 'English', 'Korean', 'Type', 'Notes', 'Tag', 'Optional'] as const;
export const TYPES = ['Line', 'StageDirection', 'Title', 'Song', 'SFX', 'Lighting', 'VFX'] as const;
export type RecordType = typeof TYPES[number];
export type SourceRecord = Record<typeof HEADERS[number], string>;
export interface ScriptRecord {
  readonly source: SourceRecord;
  readonly recordNumber: number;
  readonly no: number;
  readonly scene: number;
  readonly types: readonly RecordType[];
  readonly tags: readonly string[];
}
export interface Character { tag: string; label: string; dividerBefore?: boolean }
export interface Script { records: readonly ScriptRecord[]; characters: Character[]; identitySource: 'script' | 'cast' }
export type ParseResult = { ok: true; script: Script } | { ok: false; errors: Diagnostic[] };

const positiveInteger = (text: string) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0;
export const isStructural = (record: ScriptRecord) => record.types.includes('Title') || record.types.includes('Song');

/** CSV record numbers include the header, irrespective of embedded cell newlines. */
export function parseScript(text: string, cast?: readonly Character[]): ParseResult {
  const { rows, errors } = readCsv(text, HEADERS, 'script');
  if (!rows.length) return { ok: false, errors };
  if (rows.length === 1) errors.push({ recordNumber: 1, message: 'The script contains no records.' });

  const records: ScriptRecord[] = [];
  let previousNo = 0;
  const seenNumbers = new Set<number>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const recordNumber = i + 1;
    const report = (field: string, message: string) => errors.push({ recordNumber, field, message });
    if (cells.length !== HEADERS.length) {
      report('CSV', `Expected ${HEADERS.length} fields; received ${cells.length}.`);
      continue;
    }
    const source = Object.fromEntries(HEADERS.map((header, j) => [header, cells[j]])) as SourceRecord;
    const no = Number(source.No);
    if (!positiveInteger(source.No)) report('No', 'Must be a positive safe integer.');
    else {
      if (seenNumbers.has(no)) report('No', 'Duplicate source identifier.');
      else if (no <= previousNo) report('No', 'Source identifiers must be increasing.');
      seenNumbers.add(no);
      previousNo = no;
    }
    if (!positiveInteger(source.Scene)) report('Scene', 'Must be a positive safe integer.');
    if (!source.English.trim()) report('English', 'Content is required.');

    const types = source.Type.split(';').map(token => token.trim());
    if (types.some(token => !TYPES.includes(token as RecordType))) report('Type', `Use only: ${TYPES.join(', ')}.`);
    if (new Set(types).size !== types.length) report('Type', 'Duplicate classification token.');
    const tags = source.Tag.trim() ? source.Tag.split(';').map(tag => tag.trim()) : [];
    if (tags.some(tag => !validTag(tag)) || new Set(tags).size !== tags.length) {
      report('Tag', 'Use distinct individual tokens separated by semicolons, without empty tokens or embedded whitespace.');
    }
    if (types.includes('Line') && !source.Role.trim() && !(cast && tags.length > 0)) report('Role', 'Dialogue requires a speaker label.');
    if (source.Optional !== '' && source.Optional !== 'Y') report('Optional', 'Must be Y or blank.');
    records.push({ source, recordNumber, no, scene: Number(source.Scene), types: types as RecordType[], tags });
  }

  const names = new Map<string, string>(cast?.map(character => [character.tag, character.label]));
  for (const record of records) {
    if (cast) continue;
    if (!record.types.includes('Line') || record.tags.length !== 1 || !record.source.Role.trim()) continue;
    const tag = record.tags[0];
    const label = record.source.Role;
    if (names.has(tag) && names.get(tag) !== label) {
      errors.push({ recordNumber: record.recordNumber, field: 'Role', message: `Character token ${tag} has conflicting speaker labels.` });
    } else names.set(tag, label);
  }
  for (const record of records) {
    for (const tag of record.tags) {
      if (!names.has(tag)) errors.push({ document: 'script', recordNumber: record.recordNumber, field: 'Tag', message: cast
        ? `Character token ${tag} is missing from the cast roster.`
        : `Character token ${tag} needs a single-character dialogue record to identify its name.` });
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, script: { records, characters: cast ? cast.map(character => ({ ...character })) : [...names].map(([tag, label]) => ({ tag, label })), identitySource: cast ? 'cast' : 'script' } };
}

/** Identity comes from the roster for individuals; preserve authored group labels. */
export function attribution(record: ScriptRecord, script: Script): string {
  if (script.identitySource === 'script') return record.source.Role;
  const names = record.tags.map(tag => script.characters.find(character => character.tag === tag)?.label ?? tag);
  if (record.tags.length === 1) return names[0];
  return record.source.Role || (record.types.includes('Line') ? names.join(', ') : '');
}

export interface FilterOptions { character: string; before: number; after: number; includeNonDialogue: boolean }
export interface FilteredItem { record: ScriptRecord; highlighted: boolean; passage: number | null }
export interface FilteredScript { items: FilteredItem[]; passageCount: number }

/** Context counts source records within scene/song segments, never visual lines. */
export function filterScript(records: readonly ScriptRecord[], options: FilterOptions): FilteredScript {
  for (const count of [options.before, options.after]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Context counts must be nonnegative safe integers.');
  }
  if (!options.character) return { items: [], passageCount: 0 };
  const segments: ScriptRecord[][] = [];
  let segment: ScriptRecord[] = [];
  let scene: number | undefined;
  const includedScenes = new Set<number>();
  const selected = new Set<number>();
  for (const record of records) {
    if (record.scene !== scene || record.types.includes('Song')) {
      if (segment.length) segments.push(segment);
      segment = [];
      scene = record.scene;
    }
    if (isStructural(record)) {
      if (record.types.includes('Song') && options.includeNonDialogue && record.tags.includes(options.character)) {
        includedScenes.add(record.scene);
      }
    } else segment.push(record);
  }
  if (segment.length) segments.push(segment);

  for (const group of segments) {
    group.forEach((record, index) => {
      if (!record.tags.includes(options.character) || (!record.types.includes('Line') && !options.includeNonDialogue)) return;
      includedScenes.add(record.scene);
      const start = Math.max(0, index - options.before);
      const end = Math.min(group.length - 1, index + options.after);
      for (let i = start; i <= end; i++) selected.add(group[i].no);
    });
  }

  let passageCount = 0;
  const passages = new Map<number, number>();
  let previousIncluded = false;
  let previousScene: number | undefined;
  // Songs stop context expansion above, but belong to the displayed passage.
  // Runs touching the same song merge without including any extra source rows.
  for (const record of records) {
    if (record.scene !== previousScene || record.types.includes('Title')) previousIncluded = false;
    previousScene = record.scene;
    if (record.types.includes('Title')) continue;
    const included = selected.has(record.no) || (record.types.includes('Song') && includedScenes.has(record.scene));
    if (included) {
      if (!previousIncluded) passageCount++;
      passages.set(record.no, passageCount);
    }
    previousIncluded = included;
  }
  return {
    passageCount,
    items: records.filter(record => selected.has(record.no) || (isStructural(record) && includedScenes.has(record.scene)))
      .map(record => ({ record, passage: passages.get(record.no) ?? null,
        highlighted: record.tags.includes(options.character) && !record.types.includes('Title') })),
  };
}
