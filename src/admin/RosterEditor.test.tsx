import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {RosterEditor} from './RosterEditor';
import {sampleDraft,sampleRoles} from './roster-sample';
import {rosterFromDraft,type RosterContext} from '../roster';
let stored:RosterContext;let failSave=false;let revoked=false;let writes:unknown[];let race=false;
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 window.history.replaceState({},'','/admin/roster');
 stored={...rosterFromDraft(sampleDraft()),characters:sampleRoles,title:'Rehearsal 2026',version:'v1',productionVersion:'p1'};failSave=false;revoked=false;race=false;writes=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(revoked)return new Response(JSON.stringify({error:'forbidden'}),{status:403});
  if(String(url).endsWith('/productions'))return Response.json({home:{slug:'rehearsal'},productions:[{slug:'rehearsal',title:stored.title}]});
  if(init?.method==='PATCH'){
   const body=JSON.parse(String(init.body));writes.push(body);if(failSave)return Response.json({error:'conflict'},{status:409});
   stored={...stored,students:body.students,assignments:body.assignments,version:'v2'};return Response.json({saved:true,version:race?'earlier-version':'v2'});
  }return Response.json(stored);
 });
});
afterEach(()=>vi.restoreAllMocks());
async function edit(){
 await screen.findByRole('button',{name:'Guard One · 1부: 김민준 · EPG'});
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG'}));
 fireEvent.click(screen.getByRole('button',{name:'Edit details: 김민준 · 1부 Guard One, 1부 Merchant Two'}));
 fireEvent.change(screen.getByLabelText('Class'),{target:{value:'EPC/EPD'}});
 fireEvent.click(screen.getByRole('button',{name:'Update student'}));fireEvent.click(screen.getByRole('button',{name:'Close'}));
}
async function save(){fireEvent.click(screen.getByRole('button',{name:'Review changes'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Save changes'}));}
it('stages edits until confirmed, saves, and reloads the stored roster',async()=>{
 const view=render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await edit();expect(writes).toEqual([]);
 expect(screen.getByRole('button',{name:'Merchant Two · 1부: 김민준 · EPC/EPD'})).toBeInTheDocument();
 await save();await screen.findByText('Saved.');expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({expected:'v1',productionVersion:'p1'});
 view.unmount();render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await screen.findByRole('button',{name:'Guard One · 1부: 김민준 · EPC/EPD'});expect(screen.getByRole('button',{name:'Review changes'})).toBeDisabled();
});
it('retains the draft after conflicts and requires confirmation before loading latest',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);failSave=true;
 render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await edit();await save();await screen.findByText('Someone else updated this roster. Load the latest version before saving.');
 fireEvent.click(screen.getByRole('button',{name:'Load latest roster'}));expect(confirm).toHaveBeenCalled();expect(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPC/EPD'})).toBeInTheDocument();
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Load latest roster'}));await screen.findByRole('button',{name:'Guard One · 1부: 김민준 · EPG'});
});
it('does not declare success when another save lands before readback',async()=>{
 race=true;render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await edit();await save();await screen.findByText('Someone else updated this roster. Load the latest version before saving.');expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
});
it('keeps an unassigned student selectable and creates a separate same-name record',async()=>{
 render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await screen.findByRole('button',{name:'Guard One · 2부: 김민준 · EPI'});
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 2부: 김민준 · EPI'}));fireEvent.click(screen.getByRole('button',{name:'Clear assignment'}));
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 2부: Unassigned'}));expect(screen.getByRole('button',{name:'김민준 · EPI · No current roles'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Close'}));
 fireEvent.click(screen.getByRole('button',{name:'Add student'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'김민준'}});fireEvent.change(screen.getByLabelText('Class'),{target:{value:'EPI'}});fireEvent.click(screen.getByRole('button',{name:'Update student'}));
 await save();await screen.findByText('Saved.');expect(stored.students.filter(s=>s.name==='김민준')).toHaveLength(3);expect(stored.students.map(s=>s.id).length).toBe(new Set(stored.students.map(s=>s.id)).size);
});
it('clears private roster data when current membership is revoked',async()=>{
 render(<RosterEditor locale="en" onLocale={vi.fn()}/>);await edit();revoked=true;
 await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await waitFor(()=>expect(screen.queryByText('김민준')).not.toBeInTheDocument());expect(screen.getByRole('alert')).toHaveTextContent('Sign in again');
});
it('keeps a dirty draft on external changes and leaves Korean labels available',async()=>{
 render(<RosterEditor locale="ko" onLocale={vi.fn()}/>);await screen.findByRole('heading',{name:'배역 편집'});
 fireEvent.click(screen.getByRole('button',{name:'학생 추가'}));fireEvent.change(screen.getByLabelText('이름'),{target:{value:'박지우'}});fireEvent.click(screen.getByRole('button',{name:'반영'}));stored.version='external';
 await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await screen.findByText('다른 직원이 수정했습니다. 최신 배정을 확인하세요.');expect(screen.getByRole('button',{name:'변경 검토'})).toBeEnabled();expect(writes).toEqual([]);
});
