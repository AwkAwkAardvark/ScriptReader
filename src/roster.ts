import type { Assignment, Performance } from './assignments';
import type { Character } from './script';
export type RosterStudent = { id: string; name: string; className: string; label: string };
export type RoleAssignment = { studentId: string; tag: string; performance: Performance };
export type Roster = { students: RosterStudent[]; assignments: RoleAssignment[] };
export type RosterContext = Roster & { title: string; version: string | null; productionVersion: string; characters: Character[] };
export type RosterDraft = { students: RosterStudent[]; casting: Record<string,string> };
const object = (value: unknown): value is Record<string,unknown> => Boolean(value) && typeof value==='object' && !Array.isArray(value);
const text = (value: unknown, max: number, required=false): value is string => typeof value==='string' && value.length<=max && (!required || Boolean(value.trim())) && !/[\u0000-\u001f\u007f]/.test(value);

export function validateRoster(value: unknown, characters: readonly Character[], existing: readonly RosterStudent[] = []): {ok:true;roster:Roster}|{ok:false;errors:string[]} {
 const errors:string[]=[];
 if(!object(value)||Object.keys(value).some(key=>!['students','assignments'].includes(key))||!Array.isArray(value.students)||!Array.isArray(value.assignments))return {ok:false,errors:['Provide students and assignments.']};
 if(value.students.length>5000||value.assignments.length>5000)return {ok:false,errors:['Use at most 5,000 students and assignments.']};
 const students:RosterStudent[]=[];const ids=new Set<string>();const slots=new Set<string>();const tags=new Set(characters.map(c=>c.tag));
 for(const row of value.students){
  if(!object(row)||Object.keys(row).length!==4||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(row.id)||!text(row.name,100,true)||!text(row.className,100)||!text(row.label,60)){errors.push('Use valid student codes, names, classes and optional labels.');continue;}
  if(ids.has(row.id))errors.push('Student codes must be unique.');ids.add(row.id);
  students.push({id:row.id,name:row.name.trim(),className:row.className.trim(),label:row.label.trim()});
 }
 if(existing.some(s=>!ids.has(s.id)))errors.push('Existing students must be retained; clear their roles to unassign them.');
 const assignments:RoleAssignment[]=[];
 for(const row of value.assignments){
  if(!object(row)||Object.keys(row).length!==3||typeof row.studentId!=='string'||!ids.has(row.studentId)||typeof row.tag!=='string'||!tags.has(row.tag)||!['1부','2부'].includes(String(row.performance))){errors.push('Each assignment needs a known student, character and performance.');continue;}
  const slot=row.performance+':'+row.tag;if(slots.has(slot))errors.push('Each character can have only one student per performance.');slots.add(slot);
  assignments.push({studentId:row.studentId,tag:row.tag,performance:row.performance as Performance});
 }
 return errors.length?{ok:false,errors:[...new Set(errors)]}:{ok:true,roster:{students,assignments}};
}
export function draftFromRoster(roster:Roster):RosterDraft{return {students:roster.students.map(s=>({...s})),casting:Object.fromEntries(roster.assignments.map(a=>[a.tag+':'+a.performance,a.studentId]))};}
export function rosterFromDraft(draft:RosterDraft):Roster{return {students:draft.students,assignments:Object.entries(draft.casting).filter(([,id])=>Boolean(id)).map(([slot,studentId])=>{const split=slot.lastIndexOf(':');return {studentId,tag:slot.slice(0,split),performance:slot.slice(split+1) as Performance};})};}
export function assignmentsFromRoster(roster:Roster):Assignment[]{return roster.assignments.map(a=>{const s=roster.students.find(s=>s.id===a.studentId)!;return {...a,studentName:s.name,className:s.className};});}
