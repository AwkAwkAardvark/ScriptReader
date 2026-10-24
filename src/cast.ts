import { readCsv, validTag, type Diagnostic } from './csv';
import type { Character } from './script';

export const CAST_HEADERS = ['Tag', 'Name'] as const;
export type CastResult = { ok: true; characters: Character[] } | { ok: false; errors: Diagnostic[] };

/** Cast names are explicit metadata, independent of dialogue or stage participation. */
export function parseCast(text: string): CastResult {
  const { rows, errors } = readCsv(text, CAST_HEADERS, 'cast');
  if (rows.length === 1) errors.push({ document: 'cast', recordNumber: 1, message: 'The cast contains no characters.' });
  const characters: Character[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const report = (field: string, message: string) => errors.push({ document: 'cast', recordNumber: i + 1, field, message });
    if (rows[i].length !== 2) {
      report('CSV', `Expected 2 fields; received ${rows[i].length}.`);
      continue;
    }
    const [rawTag, label] = rows[i];
    const tag = rawTag.trim();
    if (!validTag(tag)) report('Tag', 'Each cast row requires one individual tag without whitespace, commas or semicolons.');
    if (seen.has(tag)) report('Tag', 'Duplicate cast tag.');
    seen.add(tag);
    if (!label.trim()) report('Name', 'A character name is required.');
    characters.push({ tag, label });
  }
  return errors.length ? { ok: false, errors } : { ok: true, characters };
}
