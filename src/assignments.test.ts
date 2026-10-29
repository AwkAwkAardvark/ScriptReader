import { expect, it } from 'vitest';
import { parseAssignments, assignmentMatches, type Assignment } from './assignments';
import { buildTeacherDocument } from './teacher-document';
import { scriptFor } from './test/fixtures';
const headers = 'StudentId,StudentName,Class,Performance,Tag\n';
const characters = [{ tag: 'Gua1', label: 'Guard One' }, { tag: 'Gua2', label: 'Guard Two' }];
it('supports multiple roles, both performances, blank classes and same-name students with distinct IDs', () => {
  const result = parseAssignments(headers + 's1,Student Example,Class A,1부,Gua1\ns1,Student Example,Class A,1부,Gua2\ns1,Student Example,Class A,2부,Gua1\ns2,Student Example,,2부,Gua2', characters);
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.assignments).toHaveLength(4); expect(result.warnings).toHaveLength(1); }
});
it.each([
  's1,One,A,1부,Gua1\ns2,Two,B,1부,Gua1',
  's1,One,A,1부,Gua1\ns1,Changed,A,2부,Gua1',
  's1,One,A,1부,Gua1\ns1,One,B,2부,Gua1',
  's1,One,A,3부,Gua1', 's1,One,A,1부,Unknown', 'bad id,One,A,1부,Gua1',
  's1,One,A,1부,Gua1,extra', 's1,,A,1부,Gua1',
])('rejects inconsistent or ambiguous assignment rows: %s', csv => {
  expect(parseAssignments(headers + csv, characters).ok).toBe(false);
});
it('rejects empty uploads and wrong headers', () => {
  expect(parseAssignments(headers, characters).ok).toBe(false);
  expect(parseAssignments('Tag,Name\nGua1,One', characters).ok).toBe(false);
});
it('combines class/performance selections without changing source order or record membership', () => {
  const script = scriptFor();
  const rows: Assignment[] = [
    { studentId: 's1', studentName: 'PRIVATE_STUDENT_FIXTURE', className: 'A', performance: '1부', tag: 'Ro' },
    { studentId: 's2', studentName: 'Student Two', className: 'B', performance: '2부', tag: 'Mi' },
  ];
  const entries = (performance: 'both'|'1부'|'2부', classes: string[]) => buildTeacherDocument(script, rows, { performance, classes }, true).blocks.flatMap(b => b.kind === 'scene' ? [b.entry] : b.entries);
  expect(entries('both', []).every(e => !e.highlighted)).toBe(true);
  expect(entries('1부', []).find(e => e.no === 2)?.highlighted).toBe(true);
  expect(entries('1부', ['B']).every(e => !e.highlighted)).toBe(true);
  const all = entries('both', ['A', 'B']);
  expect(all.map(e => e.no)).toEqual(script.records.map(r => r.no));
  expect(all.find(e => e.no === 2)?.highlighted).toBe(true);
  expect(all.find(e => e.no === 4)?.highlighted).toBe(true);
  expect(all.find(e => e.no === 3)?.highlighted).toBe(false);
  expect(assignmentMatches(rows[0], {performance:'2부', classes:['A']})).toBe(false);
});
