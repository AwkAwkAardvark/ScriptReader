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
 const summary=document.querySelector('.teacher-settings > summary')!;
 expect(summary.querySelector('.settings-title')).toHaveTextContent('Workshop');
 expect(summary.querySelector('.menu-icon')).toHaveTextContent('☰');
 expect(summary).toHaveAttribute('aria-label','Workshop · Both — Settings');
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
});
