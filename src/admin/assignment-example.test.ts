import { expect, it } from 'vitest';
import { assignmentExample } from './assignment-example';
import { parseAssignments } from '../assignments';
it('provides three fictional students using valid character tags, including both performances', () => {
 const characters=[{tag:'Gua1',label:'Guard One'},{tag:'Gua2',label:'Guard Two'}];
 const csv=assignmentExample(characters);const result=parseAssignments(csv,characters);
 expect(result.ok).toBe(true);
 if(result.ok) {expect(result.assignments).toHaveLength(3);expect(result.assignments.map(a=>a.studentName)).toEqual(['Alex Kim','Jamie Lee','Taylor Park']);expect(new Set(result.assignments.map(a=>a.performance)).size).toBe(2);}
});
it('uses two valid rows when a production has only one role and escapes unusual role identifiers',()=>{
 const characters=[{tag:'Gua"1',label:'Guard'}];const result=parseAssignments(assignmentExample(characters),characters);
 expect(result.ok).toBe(true);if(result.ok)expect(result.assignments).toHaveLength(2);
});
