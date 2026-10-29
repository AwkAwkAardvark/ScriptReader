import type { Assignment } from '../assignments';
import type { Script } from '../script';
export type AssignmentContext = { title: string; productionVersion: string; version: string | null; assignments: Assignment[]; characters: Script['characters'] };
export type TeacherContext = AssignmentContext & { payload: { script: Script; media: Record<string, string> } };
