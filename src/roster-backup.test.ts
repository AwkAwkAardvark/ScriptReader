import {expect,it} from 'vitest';
import {rosterBackup,parseRosterBackup,rosterFromCsv,rosterChanges} from './roster-backup';
import type {Roster} from './roster';
const characters=[{tag:'Gua1',label:'Guard One'},{tag:'Mer1',label:'Merchant One'}];
const roster:Roster={students:[{id:'s1',name:'김민준',className:'EPG',label:'A'},{id:'s2',name:'김민준',className:'EPI',label:''},{id:'s3',name:'이서연',className:'',label:'Unassigned'}],assignments:[{studentId:'s1',tag:'Gua1',performance:'1부'},{studentId:'s1',tag:'Mer1',performance:'2부'}]};
it('round-trips complete identities, labels, unassigned students and both performances without runtime metadata',()=>{
 const source={...roster,version:'private-concurrency-token',productionVersion:'another-token',audit:[{actor:'private'}],script:'private-script'};
 const backup=rosterBackup('aladdin',source,new Date('2026-11-02T00:00:00Z'));
 expect(Object.keys(backup).sort()).toEqual(['assignments','exportedAt','productionSlug','students','type','version']);expect(parseRosterBackup(JSON.parse(JSON.stringify(backup)),'aladdin',characters)).toEqual({ok:true,roster});expect(JSON.stringify(backup)).not.toMatch(/private|concurrency|audit/);
});
it('rejects foreign productions, unknown versions/keys, invalid references and duplicate slots',()=>{
 const backup=rosterBackup('aladdin',roster);
 for(const value of [{...backup,productionSlug:'other'},{...backup,version:2},{...backup,credentials:'no'},{...backup,assignments:[{studentId:'missing',tag:'Gua1',performance:'1부'}]},{...backup,assignments:[roster.assignments[0],roster.assignments[0]]}])expect(parseRosterBackup(value,'aladdin',characters).ok).toBe(false);
});
it('CSV retains labels/unassigned identities by ID and reports replacement removals without merging names',()=>{
 const next=rosterFromCsv(roster,[{studentId:'s1',studentName:'박지우',className:'EI6',tag:'Gua1',performance:'2부'}]);expect(next.students).toHaveLength(3);expect(next.students[0]).toEqual({id:'s1',name:'박지우',className:'EI6',label:'A'});expect(next.students[2]).toEqual(roster.students[2]);expect(rosterChanges(roster,next)).toMatchObject({removedStudents:0,updatedStudents:1,removedAssignments:2,addedAssignments:1});
 expect(rosterChanges(roster,{students:[],assignments:[]})).toMatchObject({removedStudents:3,removedAssignments:2,students:0,assignments:0});
});
