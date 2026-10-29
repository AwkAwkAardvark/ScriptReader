import Papa from 'papaparse';
import { ASSIGNMENT_HEADERS } from '../assignments';
import type { Character } from '../script';

/** Fictional students, using the selected production's real character identifiers. */
export function assignmentExample(characters: readonly Character[]) {
  const tags = characters.slice(0, 2).map(character => character.tag);
  const rows = tags.length ? [
    ['sample001', '김민준', 'Class A', '1부', tags[0]],
    ['sample002', '이서연', 'Class B', '2부', tags[0]],
    ...(tags[1] ? [['sample003', '박지우', 'Class A', '1부', tags[1]]] : []),
  ] : [];
  return Papa.unparse({ fields: [...ASSIGNMENT_HEADERS], data: rows });
}
