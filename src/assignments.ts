import { readCsv } from './csv';
import type { Character } from './script';

export const ASSIGNMENT_HEADERS = ['StudentId', 'StudentName', 'Class', 'Performance', 'Tag'] as const;
export const PERFORMANCES = ['1부', '2부'] as const;
export type Performance = typeof PERFORMANCES[number];
export type Assignment = { studentId: string; studentName: string; className: string; performance: Performance; tag: string };
export type AssignmentDiagnostic = { recordNumber: number; message: string };
export type AssignmentResult = { ok: true; assignments: Assignment[]; warnings: AssignmentDiagnostic[] } | { ok: false; errors: AssignmentDiagnostic[] };

/** Shared client/server validation; identifiers are opaque and production-local. */
export function parseAssignments(csv: string, characters: readonly Character[]): AssignmentResult {
  const parsed = readCsv(csv, ASSIGNMENT_HEADERS, 'cast');
  const errors: AssignmentDiagnostic[] = parsed.errors.map(({ recordNumber, message }) => ({ recordNumber, message }));
  const warnings: AssignmentDiagnostic[] = [];
  const assignments: Assignment[] = [];
  const tags = new Set(characters.map(c => c.tag));
  const students = new Map<string, string>();
  const names = new Map<string, string>();
  const slots = new Set<string>();
  if (parsed.rows.length < 2) errors.push({ recordNumber: 1, message: 'Include assignments; use Delete assignments to clear saved data.' });
  if (parsed.rows.length > 5001) errors.push({ recordNumber: 1, message: 'Use at most 5,000 assignments.' });
  for (const [i, row] of parsed.rows.slice(1, 5001).entries()) {
    const recordNumber = i + 2;
    const report = (message: string) => errors.push({ recordNumber, message });
    if (row.length !== 5) { report('Expected five fields.'); continue; }
    const [studentId, studentName, className, performance, tag] = row.map(value => value.trim());
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(studentId)) report('StudentId must be 1–64 letters, digits, underscores or hyphens.');
    if (!studentName || studentName.length > 100 || className.length > 100 || /[\u0000-\u001f]/.test(studentName + className)) report('Use a student name and optional class, each at most 100 characters without control characters.');
    if (!(PERFORMANCES as readonly string[]).includes(performance)) report('Performance must be 1부 or 2부.');
    if (!tags.has(tag)) report('Tag must identify a character in this production.');
    const identity = JSON.stringify([studentName, className]);
    if (students.has(studentId) && students.get(studentId) !== identity) report('One StudentId has conflicting names or classes.');
    students.set(studentId, identity);
    if (names.has(studentName) && names.get(studentName) !== studentId) warnings.push({ recordNumber, message: 'This name belongs to multiple StudentIds. Confirm these are different students.' });
    names.set(studentName, studentId);
    const slot = JSON.stringify([performance, tag]);
    if (slots.has(slot)) report('Each character can have only one student per performance; duplicate rows are also rejected.');
    slots.add(slot);
    assignments.push({ studentId, studentName, className, performance: performance as Performance, tag });
  }
  return errors.length ? { ok: false, errors } : { ok: true, assignments, warnings };
}

export type ViewerSelection = { performance: Performance | 'both'; classes: string[]; studentIds?: string[] };
export function assignmentMatches(assignment: Assignment, selection: ViewerSelection) {
  if (selection.performance !== 'both' && assignment.performance !== selection.performance) return false;
  if (!selection.classes.length && !selection.studentIds?.length) return selection.performance !== 'both';
  return selection.classes.includes(assignment.className) || Boolean(selection.studentIds?.includes(assignment.studentId));
}
