import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ProductionManager } from './ProductionManager';
import { productionCall, ProductionFailure } from './productions';
import { csvFor } from '../test/fixtures';
vi.mock('./productions',async original=>({...await original<typeof import('./productions')>(),productionCall:vi.fn()}));
const production={slug:'paper-2026',title:'Paper 2026',version:'v1',revision:'r1',before:2,after:1,publishedAt:'2026-10-29T00:00:00Z',mediaCount:1};
const listing={productions:[production],home:{slug:production.slug,version:'h1'}};
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState({},'', '/admin/scripts');vi.mocked(productionCall).mockImplementation(async (path,method)=>path.endsWith('/songs')?{songs:[{no:9,title:'A little time to wonder',video:'abcdefghijk'}],version:'v1'}:method==='GET'||!method?listing:{records:19,characters:6,videos:0,media:{},songs:[],unmatched:[]});});
it('saves blank home explicitly and edits defaults independently of file publication',async()=>{
 render(<ProductionManager locale="en"/>);
 fireEvent.change(await screen.findByLabelText('Student homepage'),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Save homepage'}));
 await waitFor(()=>expect(productionCall).toHaveBeenCalledWith('home','PATCH',{slug:null,expected:'h1'}));
 fireEvent.change(screen.getByLabelText('Choose a production'),{target:{value:'paper-2026'}});await waitFor(()=>expect(screen.getByLabelText('Reader title')).not.toBeDisabled());
 fireEvent.change(within(screen.getByRole('group',{name:'Default context'})).getByRole('slider',{name:'Before'}),{target:{value:'5'}});
 fireEvent.click(screen.getByRole('button',{name:'Save production settings'}));
 await waitFor(()=>expect(productionCall).toHaveBeenCalledWith('productions/paper-2026','PATCH',{title:'Paper 2026',before:5,after:1,expected:'v1'}));
});
it('requires validation and confirmation, then invalidates preview after a file or title change',async()=>{
 render(<ProductionManager locale="en"/>);fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});await waitFor(()=>expect(screen.getByLabelText('Reader title')).not.toBeDisabled());
 const upload=async(label:string,text:string)=>{const file=new File([text],'synthetic.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:async()=>text});fireEvent.change(screen.getByLabelText(label),{target:{files:[file]}});await waitFor(()=>expect(screen.getByLabelText(label)).not.toBeDisabled());};
 await upload('Script CSV',csvFor());await upload('Cast CSV','Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four');
 expect(screen.queryByText('Existing link')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByText('Validation passed');
 fireEvent.click(screen.getByRole('button',{name:'Publish'}));expect(screen.getByRole('dialog')).toHaveTextContent('Paper 2026');
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}));
 expect(vi.mocked(productionCall).mock.calls.some(([path])=>path.endsWith('/publish'))).toBe(false);
 fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'Changed'}});
 expect(screen.queryByText('Validation passed')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Publish'})).not.toBeInTheDocument();
});
it('shows conflicts and removes loaded production data after access is revoked',async()=>{
 render(<ProductionManager locale="ko"/>);fireEvent.change(await screen.findByLabelText('공연 선택'),{target:{value:'paper-2026'}});await waitFor(()=>expect(screen.getByLabelText('대본 제목')).not.toBeDisabled());
 vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('conflict'));
 fireEvent.click(screen.getByRole('button',{name:'공연 설정 저장'}));expect(await screen.findByRole('alert')).toHaveTextContent('목록을 새로고침');
 vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('forbidden'));
 fireEvent.click(screen.getByRole('button',{name:'공연 설정 저장'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'새 공연'})).not.toBeInTheDocument());
 expect(screen.queryByRole('link',{name:'/p/paper-2026'})).not.toBeInTheDocument();
});
it('collapses existing uploads, hides link identifiers and uses the student sliders at the top',async()=>{
 render(<ProductionManager locale="en"/>);
 fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});
 await waitFor(()=>expect(screen.getByLabelText('Reader title')).not.toBeDisabled());
 expect(document.querySelector('.upload-card')).not.toHaveAttribute('open');
 expect(screen.queryByLabelText('Link identifier')).not.toBeInTheDocument();
 const sliders=screen.getByRole('group',{name:'Default context'});
 expect(within(sliders).getByRole('slider',{name:'Before'})).toHaveValue('2');
 expect(within(sliders).getByRole('slider',{name:'After'})).toHaveValue('1');
 expect(sliders.compareDocumentPosition(screen.getByLabelText('Reader title')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole('link',{name:'Manage songs'})).toHaveAttribute('href','/admin/songs?production=paper-2026');
});
it('opens examples for a new production and generates the link automatically',async()=>{
 render(<ProductionManager locale="en"/>);fireEvent.click(await screen.findByRole('button',{name:'New production'}));
 fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'New Musical 2027'}});
 expect(document.querySelector('.upload-card')).toHaveAttribute('open');
 expect(document.querySelectorAll('.csv-example[open]')).toHaveLength(3);
 expect(screen.queryByLabelText('Link identifier')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Reader title'),{target:{value:'a'.repeat(69)+' '+ 'b'.repeat(15)}});
 for(const [label,value] of [['Script CSV',csvFor()],['Cast CSV','Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four']]){
  const file=new File([value],'sample.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:async()=>value});fireEvent.change(screen.getByLabelText(label),{target:{files:[file]}});await waitFor(()=>expect(screen.getByLabelText(label)).not.toBeDisabled());
 }
 fireEvent.click(screen.getByRole('button',{name:'Validate and preview'}));await screen.findByText('Validation passed');
 const input=vi.mocked(productionCall).mock.calls.find(([path])=>path==='productions/validate')![2] as {slug:string};
 expect(input.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);expect(input.slug.length).toBeLessThanOrEqual(80);
});
