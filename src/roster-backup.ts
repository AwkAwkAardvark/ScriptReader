import type {Assignment} from './assignments';
import {validateRoster,type Roster,type RosterStudent} from './roster';
import type {Character} from './script';
export const ROSTER_BACKUP_TYPE='script-reader-roster';
export type RosterBackup=Roster&{type:typeof ROSTER_BACKUP_TYPE;version:1;productionSlug:string;exportedAt?:string};
export function rosterBackup(productionSlug:string,roster:Roster,now=new Date()):RosterBackup{
 return {type:ROSTER_BACKUP_TYPE,version:1,productionSlug,exportedAt:now.toISOString(),students:roster.students.map(s=>({id:s.id,name:s.name,className:s.className,label:s.label})),assignments:roster.assignments.map(a=>({studentId:a.studentId,tag:a.tag,performance:a.performance}))};
}
export function parseRosterBackup(value:unknown,slug:string,characters:readonly Character[]){
 if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false as const,errors:['Choose a roster JSON backup.']};
 const record=value as Record<string,unknown>;
 if(Object.keys(record).some(k=>!['type','version','productionSlug','exportedAt','students','assignments'].includes(k))||record.type!==ROSTER_BACKUP_TYPE||record.version!==1)return {ok:false as const,errors:['Unsupported roster backup format or version.']};
 if(record.productionSlug!==slug)return {ok:false as const,errors:['This backup belongs to a different production.']};
 if(record.exportedAt!==undefined&&(typeof record.exportedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(record.exportedAt)||!Number.isFinite(Date.parse(record.exportedAt))))return {ok:false as const,errors:['Invalid backup export date.']};
 return validateRoster({students:record.students,assignments:record.assignments},characters);
}
/** CSV replaces casting while retaining independent students and their optional labels. */
export function rosterFromCsv(current:Roster,rows:readonly Assignment[]):Roster{
 const people=new Map<string,RosterStudent>(current.students.map(s=>[s.id,{...s}]));
 for(const row of rows){const existing=people.get(row.studentId);people.set(row.studentId,{id:row.studentId,name:row.studentName,className:row.className,label:existing?.label??''});}
 return {students:[...people.values()],assignments:rows.map(row=>({studentId:row.studentId,tag:row.tag,performance:row.performance}))};
}
export function rosterChanges(before:Roster,after:Roster){
 const oldStudents=new Map(before.students.map(s=>[s.id,s]));const nextStudents=new Map(after.students.map(s=>[s.id,s]));
 const key=(a:Roster['assignments'][number])=>JSON.stringify([a.studentId,a.tag,a.performance]);
 const oldAssignments=new Set(before.assignments.map(key));const nextAssignments=new Set(after.assignments.map(key));
 return {students:after.students.length,assignments:after.assignments.length,addedStudents:after.students.filter(s=>!oldStudents.has(s.id)).length,removedStudents:before.students.filter(s=>!nextStudents.has(s.id)).length,updatedStudents:after.students.filter(s=>{const old=oldStudents.get(s.id);return old&&(old.name!==s.name||old.className!==s.className||old.label!==s.label);}).length,addedAssignments:[...nextAssignments].filter(k=>!oldAssignments.has(k)).length,removedAssignments:[...oldAssignments].filter(k=>!nextAssignments.has(k)).length};
}
export type RosterChanges=ReturnType<typeof rosterChanges>;
