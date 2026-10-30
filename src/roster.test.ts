import {expect,it} from 'vitest';
import {validateRoster,draftFromRoster,rosterFromDraft,assignmentsFromRoster,type Roster} from './roster';
const characters=[{tag:'Gua1',label:'Guard One'},{tag:'Gua2',label:'Guard Two'}];
const roster:Roster={students:[{id:'s1',name:'김민준',className:'EPI',label:'A'},{id:'s2',name:'김민준',className:'EPI',label:'B'}],assignments:[{studentId:'s1',tag:'Gua1',performance:'1부'},{studentId:'s1',tag:'Gua1',performance:'2부'},{studentId:'s1',tag:'Gua2',performance:'1부'}]};
it('preserves separate same-name students and round trips multiple-role/performance casting',()=>{
 expect(validateRoster(roster,characters)).toEqual({ok:true,roster});expect(rosterFromDraft(draftFromRoster(roster))).toEqual(roster);
 expect(assignmentsFromRoster(roster)[0]).toEqual({studentId:'s1',studentName:'김민준',className:'EPI',tag:'Gua1',performance:'1부'});
});
it('allows an unassigned student but not accidentally removing existing students',()=>{
 expect(validateRoster({...roster,assignments:[]},characters,roster.students).ok).toBe(true);
 expect(validateRoster({students:[roster.students[0]],assignments:[]},characters,roster.students).ok).toBe(false);
});
it.each([
 {...roster,students:[...roster.students,roster.students[0]]},
 {...roster,assignments:[...roster.assignments,{studentId:'s2',tag:'Gua1',performance:'1부'}]},
 {...roster,assignments:[{studentId:'missing',tag:'Gua1',performance:'1부'}]},
 {...roster,assignments:[{studentId:'s1',tag:'bad',performance:'1부'}]},
 {...roster,assignments:[{studentId:'s1',tag:'Gua1',performance:'3부'}]},
 {...roster,students:[{...roster.students[0],label:'x'.repeat(61)}]},
 {...roster,students:[{...roster.students[0],name:'bad\nname'}]},
 {...roster,students:[{...roster.students[0],role:'master'}]},
])('rejects invalid roster references, fields and identities',value=>{expect(validateRoster(value,characters).ok).toBe(false);});
