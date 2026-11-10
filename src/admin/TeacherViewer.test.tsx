import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TeacherViewer } from './TeacherViewer';
import { AssignmentManager } from './AssignmentManager';
import { productionCall, ProductionFailure } from './productions';
import { scriptFor } from '../test/fixtures';
vi.mock('./productions', async original => ({ ...await original<typeof import('./productions')>(), productionCall: vi.fn() }));
const assignments = [
 {studentId:'s1',studentName:'<img src=x onerror=alert(1)>',className:'Class A',performance:'1부' as const,tag:'Ro'},
 {studentId:'s2',studentName:'Student Two',className:'Class B',performance:'2부' as const,tag:'Mi'},
];
const context = {title:'Workshop',productionVersion:'p1',version:'a1',assignments,characters:scriptFor().characters,payload:{script:scriptFor(),media:{}}};
const list = {productions:[{slug:'workshop',title:'Workshop'}],home:{slug:'workshop'}};
beforeEach(() => {
 vi.clearAllMocks();window.history.replaceState({}, '', '/admin/viewer');
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 vi.mocked(productionCall).mockImplementation(async path => path==='productions'?list:context);
});
it('opens with collapsed settings and both casting columns, highlights dialogue without hiding anything',async()=>{
 render(<TeacherViewer locale="en"/>);
 await screen.findAllByText('Student Two');
 expect(document.querySelector('.teacher-settings')).not.toHaveAttribute('open');
 expect(screen.getByRole('link',{name:'Edit roster'})).toHaveAttribute('href','/admin/roster?production=workshop');
 const summary=document.querySelector('.teacher-settings > summary')!;
 expect(summary.querySelector('.teacher-settings-icon')).toHaveAttribute('aria-hidden','true');
 expect(summary).toHaveAttribute('aria-label','Workshop · Both — Reading settings');
 expect(screen.getByLabelText('Display Korean lines').parentElement).toHaveClass('toggle-row');
 expect(document.querySelectorAll('.teacher-view .roster-multi-role')).toHaveLength(0);
 expect(document.querySelectorAll('.script-entry.highlighted')).toHaveLength(0);
 const initial=document.querySelectorAll('[data-record]').length;
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);
 fireEvent.click(screen.getByLabelText('Class A'));
 expect(document.querySelector('.script-entry[data-record="2"]')).toHaveClass('highlighted');
 expect(document.querySelector('.script-entry[data-record="4"]')).not.toHaveClass('highlighted');
 expect(document.querySelectorAll('[data-record]')).toHaveLength(initial);
 expect(document.querySelector('img[src=x]')).not.toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('Class B'));
 expect(document.querySelector('.script-entry[data-record="4"]')).toHaveClass('highlighted');
 fireEvent.click(screen.getByRole('radio',{name:'1부'}));
 expect(document.querySelector('.script-entry[data-record="4"]')).not.toHaveClass('highlighted');
 expect(document.querySelector('.teacher-student-selected')).toHaveTextContent('<img src=x onerror=alert(1)>');
});
it('localizes settings and removes private data when a recheck finds revoked access',async()=>{
 render(<TeacherViewer locale="ko"/>);await screen.findAllByText('Student Two');
 expect(screen.getByLabelText('한국어 표기')).toBeChecked();
 vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('forbidden'));
 fireEvent(document,new Event('visibilitychange'));
 await screen.findByRole('alert');
 expect(screen.queryAllByText('Student Two')).toHaveLength(0);
});
it('invalidates assignment preview when files change and requires explicit confirmation to save',async()=>{
 const csv='StudentId,StudentName,Class,Performance,Tag\ns1,Example,A,1부,Ro';
 vi.mocked(productionCall).mockImplementation(async(path,method)=>path==='productions'?list:path.endsWith('/validate')?{assignments,warnings:[]}:method==='PATCH'?{saved:true}:context);
 render(<AssignmentManager locale="en"/>);await screen.findByLabelText('Assignment CSV');
 const upload=async(value:string)=>{const file=new File([value],'synthetic.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:async()=>value});fireEvent.change(screen.getByLabelText('Assignment CSV'),{target:{files:[file]}});await waitFor(()=>expect(screen.getByRole('button',{name:'Validate and preview'})).not.toBeDisabled());};
 await upload(csv);fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByRole('heading',{name:'Assignment preview'});
 expect(vi.mocked(productionCall).mock.calls.some(([,method])=>method==='PATCH')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Save assignments'}));expect(screen.getByRole('dialog')).toHaveTextContent('Replace all student assignments?');
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await upload(csv.replace('Example','Changed'));
 expect(screen.queryByRole('heading',{name:'Assignment preview'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByRole('heading',{name:'Assignment preview'});
 fireEvent.click(screen.getByRole('button',{name:'Save assignments'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 await waitFor(()=>expect(productionCall).toHaveBeenCalledWith('productions/workshop/assignments','PATCH',{expected:'a1',productionVersion:'p1',csv:csv.replace('Example','Changed')}));
});

it('highlights joint dialogue for any matching participant but only the matching cast name',async()=>{
 const script=scriptFor();
 const joint={...context,payload:{...context.payload,script:{...script,records:script.records.map(r=>r.no===2?{...r,tags:['Ro','Mi']}:r)}}};
 vi.mocked(productionCall).mockImplementation(async path=>path==='productions'?list:joint);
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);fireEvent.click(screen.getByLabelText('Class A'));
 const line=document.querySelector('.script-entry[data-record="2"]')!;
 expect(line).toHaveClass('highlighted');
 expect(line.querySelectorAll('.teacher-student-selected')).toHaveLength(1);
 expect(line.querySelector('.teacher-student-selected')).not.toHaveTextContent('Student Two');
 fireEvent.click(screen.getByLabelText('Class A'));fireEvent.click(screen.getByLabelText('Class B'));
 expect(line.querySelector('.entry-name')?.textContent).toBe('Rowan, Mira');
 expect(line.querySelector('.teacher-role-selected')?.textContent).toBe('Mira');
 expect(line.querySelector('.teacher-role-selected')?.previousSibling?.textContent).toBe(', ');
});

it('retains a selected class after a roster rename so teachers can explicitly clear it',async()=>{
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);fireEvent.click(screen.getByLabelText('Class A'));
 const renamed={...context,version:'a2',assignments:assignments.map(a=>({...a,className:a.className==='Class A'?'Class C':a.className}))};
 vi.mocked(productionCall).mockImplementation(async path=>path==='productions'?list:renamed);
 fireEvent(document,new Event('visibilitychange'));await screen.findByLabelText('Class C');
 expect(screen.getByLabelText('Class A')).toBeChecked();fireEvent.click(screen.getByLabelText('Class A'));expect(screen.queryByLabelText('Class A')).not.toBeInTheDocument();
 expect(document.querySelector('.script-entry[data-record="2"]')).not.toHaveClass('highlighted');
});

it('adjusts English reading scale without making requests or changing casting selection',async()=>{
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');
 const requests=vi.mocked(productionCall).mock.calls.length;
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);fireEvent.click(screen.getByLabelText('Class A'));
 fireEvent.change(screen.getByRole('slider',{name:/Text size/}),{target:{value:'200'}});
 expect(document.querySelector('.teacher-reading-workspace')).toHaveStyle({'--teacher-font-scale':'2'});
 expect(document.querySelector('.teacher-reading-content')).toHaveClass('teacher-large-type');
 expect(screen.getByLabelText('Class A')).toBeChecked();expect(document.querySelector('.script-entry[data-record="2"]')).toHaveClass('highlighted');
 expect(vi.mocked(productionCall).mock.calls.length).toBe(requests);
 fireEvent.click(screen.getByRole('button',{name:'Reset size'}));expect(screen.getByRole('slider',{name:/Text size/})).toHaveValue('100');
});
it('provides source-order scene links without refetching or resetting rehearsal filters',async()=>{
 const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);fireEvent.click(screen.getByLabelText('Class B'));fireEvent.click(screen.getByRole('radio',{name:'2부'}));
 const requests=vi.mocked(productionCall).mock.calls.length;const links=screen.getByRole('navigation',{name:'Chapters'}).querySelectorAll('a');
 expect([...links].map(a=>a.getAttribute('href'))).toEqual(['#teacher-scene-1','#teacher-scene-14','#teacher-scene-18']);
 fireEvent.click(links[1]);await waitFor(()=>expect(scroll).toHaveBeenCalledWith({block:'start'}));
 expect(document.getElementById('teacher-scene-14')).toHaveFocus();expect(screen.getByLabelText('Class B')).toBeChecked();expect(screen.getByRole('radio',{name:'2부'})).toBeChecked();
 expect(vi.mocked(productionCall).mock.calls.length).toBe(requests);
});
it('closes the contextual panel with Escape and returns focus to its compact trigger',async()=>{
 render(<TeacherViewer locale="ko"/>);await screen.findAllByText('Student Two');const summary=document.querySelector<HTMLElement>('.teacher-settings > summary')!;
 fireEvent.click(summary);expect(document.querySelector('.teacher-settings')).toHaveAttribute('open');
 fireEvent.keyDown(screen.getByRole('slider',{name:/글자 크기/}),{key:'Escape'});expect(document.querySelector('.teacher-settings')).not.toHaveAttribute('open');expect(summary).toHaveFocus();
});

function chooseRoles(...tags: string[]) {
 const filter = document.querySelector<HTMLDetailsElement>('.teacher-role-filter')!;
 if (!filter.open) fireEvent.click(filter.querySelector('summary')!);
 for (const checkbox of filter.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
  if (checkbox.checked !== tags.includes(checkbox.value)) fireEvent.click(checkbox);
 }
}

it('focuses roles locally using production defaults, preserving context across roles and resetting on production change',async()=>{
 const productions={productions:[{slug:'workshop',title:'Workshop',before:1,after:0},{slug:'other',title:'Other',before:4,after:3}],home:{slug:'workshop'}};
 vi.mocked(productionCall).mockImplementation(async path=>path==='productions'?productions:context);
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');
 fireEvent.click(document.querySelector('.teacher-settings > summary')!);
 expect(document.querySelector('.teacher-role-filter > summary')).toHaveTextContent('All roles');
 expect(screen.queryByRole('slider',{name:'Before'})).not.toBeInTheDocument();
 const all=document.querySelectorAll('[data-record]').length;
 const requests=vi.mocked(productionCall).mock.calls.length;
 chooseRoles('Ro');
 expect(screen.getByRole('slider',{name:'Before'})).toHaveValue('1');expect(screen.getByRole('slider',{name:'After'})).toHaveValue('0');
 expect(screen.getByLabelText('Hide actions & cues')).not.toBeChecked();
 expect(document.querySelectorAll('[data-record]').length).toBeLessThan(all);
 fireEvent.change(screen.getByRole('slider',{name:'Before'}),{target:{value:'5'}});
 fireEvent.change(screen.getByRole('slider',{name:'After'}),{target:{value:'2'}});
 fireEvent.click(screen.getByLabelText('Hide actions & cues'));
 chooseRoles('Ro', 'Mi');
 expect(document.querySelector('.teacher-role-filter > summary')).toHaveTextContent('2 roles');
 expect(document.querySelector('[data-record="2"]')).toHaveClass('highlighted');
 expect(document.querySelector('[data-record="4"]')).toHaveClass('highlighted');
 expect(screen.getByRole('slider',{name:'Before'})).toHaveValue('5');expect(screen.getByRole('slider',{name:'After'})).toHaveValue('2');expect(screen.getByLabelText('Hide actions & cues')).toBeChecked();
 chooseRoles();
 expect(document.querySelectorAll('[data-record]')).toHaveLength(all);
 chooseRoles('Ro');
 expect(screen.getByRole('slider',{name:'Before'})).toHaveValue('5');
 expect(vi.mocked(productionCall).mock.calls.length).toBe(requests);
 fireEvent.change(screen.getByLabelText('Production'),{target:{value:'other'}});
 await waitFor(()=>expect(productionCall).toHaveBeenCalledWith('productions/other/viewer'));
 await screen.findAllByText('Student Two');expect(document.querySelector('.teacher-role-filter > summary')).toHaveTextContent('All roles');
 chooseRoles('Ro');
 expect(screen.getByRole('slider',{name:'Before'})).toHaveValue('4');expect(screen.getByRole('slider',{name:'After'})).toHaveValue('3');expect(screen.getByLabelText('Hide actions & cues')).not.toBeChecked();
});

it('keeps focused target highlights independent from class/performance emphasis and retains shared cast tags',async()=>{
 const script=scriptFor();const joint={...context,payload:{...context.payload,script:{...script,records:script.records.map(r=>r.no===2?{...r,tags:['Ro','Mi'],source:{...r.source,English:'(quietly) Shared line'}}:r)}}};
 vi.mocked(productionCall).mockImplementation(async path=>path==='productions'?list:joint);
 render(<TeacherViewer locale="en"/>);await screen.findAllByText('Student Two');fireEvent.click(document.querySelector('.teacher-settings > summary')!);
 chooseRoles('Ro');
 const initial=[...document.querySelectorAll('[data-record]')].map(e=>e.getAttribute('data-record'));
 fireEvent.click(screen.getByLabelText('Class B'));fireEvent.click(screen.getByRole('radio',{name:'2부'}));
 const line=document.querySelector('.script-entry[data-record="2"]')!;
 expect(line).toHaveClass('highlighted');expect(line.querySelector('.teacher-role-selected')).toHaveTextContent('Mira');expect(line.querySelector('.teacher-student-selected')).toHaveTextContent('Student Two');
 expect(line.querySelectorAll('.teacher-cast')).toHaveLength(2);
 expect([...document.querySelectorAll('[data-record]')].map(e=>e.getAttribute('data-record'))).toEqual(initial);
 fireEvent.click(screen.getByLabelText('Hide actions & cues'));expect(document.querySelector('.script-entry[data-record="8"]')).not.toBeInTheDocument();expect(line.querySelector('.inline-stage-action')).toHaveTextContent('(quietly)');
});

it('localizes focus controls, shows an empty focused role and limits chapter links to displayed scenes',async()=>{
 const script=scriptFor();const characters=[...script.characters,{tag:'Nil1',label:'Empty role'}];
 vi.mocked(productionCall).mockImplementation(async path=>path==='productions'?list:{...context,characters,payload:{...context.payload,script:{...script,characters}}});
 render(<TeacherViewer locale="ko"/>);await screen.findAllByText('Student Two');fireEvent.click(document.querySelector('.teacher-settings > summary')!);
 expect(document.querySelector('.teacher-role-filter > summary')).toHaveTextContent('전체 배역');
 chooseRoles('Mi');
 expect(screen.getByRole('slider',{name:'앞'})).toHaveAttribute('max','5');expect(screen.getByLabelText('동작·큐 숨기기')).not.toBeChecked();
 expect(screen.getByRole('navigation',{name:'장 바로가기'}).querySelectorAll('a')).toHaveLength(2);
 chooseRoles('Nil1');
 expect(screen.queryByRole('navigation',{name:'장 바로가기'})).not.toBeInTheDocument();expect(document.querySelectorAll('[data-record]')).toHaveLength(0);expect(screen.getByText('해당 내용이 없습니다.')).toHaveAttribute('role','status');
});
