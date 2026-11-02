import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {ProductionManager} from './ProductionManager';
import {AssignmentManager} from './AssignmentManager';
import {productionCall,ProductionFailure} from './productions';
import {csvFor,scriptFor} from '../test/fixtures';
vi.mock('./productions',async original=>({...await original<typeof import('./productions')>(),productionCall:vi.fn()}));
const first={slug:'paper-2026',title:'Paper 2026',version:'v1',revision:'r1',before:2,after:1,publishedAt:'2026-10-29T00:00:00Z',mediaCount:1};
const other={...first,slug:'other',title:'Other'};const cast='Tag,Name\nRo,Rowan\nMi,Mira';
const songs=[{no:9,title:'A little time to wonder',video:'abcdefghijk'}];
let state=structuredClone(first);let home={slug:'paper-2026' as string|null,version:'h1'};
beforeEach(()=>{
 window.history.replaceState({},'','/admin/scripts');state=structuredClone(first);home={slug:'paper-2026',version:'h1'};vi.clearAllMocks();
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 vi.mocked(productionCall).mockImplementation(async(path,method,raw)=>{
  const body=raw as Record<string,any>;
  if(path==='productions')return structuredClone({productions:[state,other],home});
  if(path==='home'){home={slug:body.slug,version:'h2'};return {saved:true};}
  if(path==='productions/validate')return {records:20,characters:2,videos:1,media:{9:'abcdefghijk'},songs,baselineSongs:songs,unmatched:[]};
  if(path.endsWith('/songs'))return {songs,version:state.version};
  if(path.endsWith('/assignments'))return {title:state.title,version:'a1',productionVersion:state.version,assignments:[],characters:scriptFor().characters};
  if(method==='PATCH'){state={...state,...body,version:'v2'};return {saved:true};}
  if(path.endsWith('/publish')){state={...state,...body,version:'v3',revision:'r2'};return {saved:true};}
  return {};
 });
});
const warned=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};
async function ready(){render(<ProductionManager locale="en"/>);fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});await waitFor(()=>expect(screen.getByLabelText('Reader title')).not.toBeDisabled());}
async function file(label:string,value:string){const selected=new File([value],'synthetic.csv',{type:'text/csv'});Object.defineProperty(selected,'text',{value:async()=>value});fireEvent.change(screen.getByLabelText(label),{target:{files:[selected]}});await waitFor(()=>expect(screen.getByLabelText(label)).not.toBeDisabled());}
it('keeps production preparation after homepage save and keeps selection unchanged until discard',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Edited title'}});await file('Script CSV',csvFor());await file('Cast CSV',cast);fireEvent.change(screen.getByLabelText('Student homepage'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save homepage'}));await screen.findByText('Saved.');
 expect(screen.getByLabelText('Reader title')).toHaveValue('Edited title');expect(screen.getByRole('button',{name:'Validate and preview'})).toBeEnabled();expect(warned()).toBe(true);
 fireEvent.change(screen.getByLabelText('Choose a production'),{target:{value:'other'}});expect(screen.getByLabelText('Choose a production')).toHaveValue('paper-2026');expect(screen.getByRole('button',{name:'Keep editing'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(screen.getByLabelText('Reader title')).toHaveValue('Edited title');
 fireEvent.change(screen.getByLabelText('Choose a production'),{target:{value:'other'}});fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));await waitFor(()=>expect(screen.getByLabelText('Reader title')).toHaveValue('Other'));expect(warned()).toBe(false);
});
it('settings save retains uploads/home choice and publishes with the new checked baseline',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Saved title'}});await file('Script CSV',csvFor());await file('Cast CSV',cast);fireEvent.change(screen.getByLabelText('Student homepage'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save production settings'}));await screen.findByText('Saved.');
 expect(screen.getByLabelText('Student homepage')).toHaveValue('');expect(screen.getByRole('button',{name:'Save homepage'})).toBeEnabled();expect(screen.getByRole('button',{name:'Validate and preview'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByText('Validation passed');expect(vi.mocked(productionCall).mock.calls.find(([path])=>path==='productions/validate')![2]).toMatchObject({expected:'v2',script:csvFor(),cast});
 fireEvent.click(screen.getByRole('button',{name:'Publish'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Publish'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Validate and preview'})).toBeDisabled());
 expect(screen.getByLabelText('Student homepage')).toHaveValue('');expect(warned()).toBe(true);fireEvent.change(screen.getByLabelText('Student homepage'),{target:{value:'paper-2026'}});expect(warned()).toBe(false);
});
it('preserves explicit video removals when title/default edits invalidate validation',async()=>{
 await ready();await file('Script CSV',csvFor());await file('Cast CSV',cast);fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByText('Validation passed');fireEvent.click(screen.getByText('Review song links · 1'));fireEvent.click(screen.getByRole('button',{name:'Remove link'}));fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Edited'}});fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByText('Validation passed');
 const calls=vi.mocked(productionCall).mock.calls.filter(([path])=>path==='productions/validate');expect(calls[1][2]).toMatchObject({mediaEdits:{9:null}});
});
it('reverted settings and disclosure browsing are clean, but an empty or invalid selected file is preparation',async()=>{
 await ready();expect(warned()).toBe(false);fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Changed'}});expect(warned()).toBe(true);fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Paper 2026'}});expect(warned()).toBe(false);
 await file('Script CSV','');expect(warned()).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Refresh list'}));fireEvent(screen.getByRole('dialog',{name:'Unsaved changes'}),new Event('cancel',{cancelable:true}));expect(warned()).toBe(true);
 const oversized=new File(['x'],'oversized.csv');Object.defineProperty(oversized,'size',{value:5*1024*1024+1});fireEvent.change(screen.getByLabelText('Script CSV'),{target:{files:[oversized]}});await screen.findByRole('alert');expect(warned()).toBe(true);
});
it('retains settings/uploads after validation and save failures',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Keep this'}});await file('Script CSV',csvFor());await file('Cast CSV',cast);vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('validation','Invalid input'));fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByRole('alert');expect(screen.getByLabelText('Reader title')).toHaveValue('Keep this');expect(screen.getByRole('button',{name:'Validate and preview'})).toBeEnabled();
 vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('conflict'));fireEvent.click(screen.getByRole('button',{name:'Save production settings'}));await screen.findByText(/This production or homepage changed/);expect(screen.getByLabelText('Reader title')).toHaveValue('Keep this');expect(warned()).toBe(true);
});
it('assignment imports count empty/invalid files and retain them after failed validation',async()=>{
 window.history.replaceState({},'','/admin/assignments');render(<AssignmentManager locale="ko"/>);await screen.findByLabelText('배역 배정 CSV');expect(warned()).toBe(false);await file('배역 배정 CSV','');expect(warned()).toBe(true);
 await file('배역 배정 CSV','bad headers\ninvalid');fireEvent.click(screen.getByRole('button',{name:'검증 및 미리보기'}));await screen.findByRole('alert');expect(warned()).toBe(true);fireEvent.change(screen.getByLabelText('공연 선택'),{target:{value:'other'}});expect(screen.getByRole('dialog',{name:'저장하지 않은 변경'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'계속 편집'}));expect(screen.getByLabelText('공연 선택')).toHaveValue('paper-2026');
});
