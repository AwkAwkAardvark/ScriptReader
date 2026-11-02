import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {SongManager} from './SongManager';
import {productionCall,ProductionFailure} from './productions';
vi.mock('./productions',async original=>({...await original<typeof import('./productions')>(),productionCall:vi.fn()}));
const listing={productions:[{slug:'paper-2026',title:'Paper 2026',version:'v1'}],home:{slug:null,version:'h1'}};
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
beforeEach(()=>{window.history.replaceState({},'','/admin/songs');vi.clearAllMocks();vi.mocked(productionCall).mockImplementation(async(path,method)=>method==='PATCH'?{saved:true}:path.endsWith('/songs')?{songs:[{no:9,title:'A song',video:'abcdefghijk'}],version:'v1'}:listing);});
it('groups existing songs in one collapsed card and requires confirmation before removing a link',async()=>{
 render(<SongManager locale="en"/>);fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});
 await waitFor(()=>expect(document.querySelector('.songs-card')).toBeInTheDocument());expect(document.querySelector('.songs-card')).not.toHaveAttribute('open');
 fireEvent.click(screen.getByText('Song links · 1'));expect(window.location.search).toContain('production=paper-2026');
 fireEvent.click(screen.getByRole('button',{name:'Remove link'}));fireEvent.click(screen.getByRole('button',{name:'Save song links'}));
 expect(vi.mocked(productionCall).mock.calls.some(([,method])=>method==='PATCH')).toBe(false);
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirm'}));
 await waitFor(()=>expect(productionCall).toHaveBeenCalledWith('productions/paper-2026/songs','PATCH',{expected:'v1',mediaEdits:{9:null}}));
});
it('loads a linked production directly and clears song details after permission denial',async()=>{
 window.history.replaceState({},'','/admin/songs?production=paper-2026');render(<SongManager locale="ko"/>);
 await waitFor(()=>expect(document.querySelector('.songs-card')).toBeInTheDocument());fireEvent.click(screen.getByText('노래 연결 · 1'));
 vi.mocked(productionCall).mockRejectedValueOnce(new ProductionFailure('forbidden'));
 fireEvent.click(screen.getByRole('button',{name:'연결 삭제'}));fireEvent.click(screen.getByRole('button',{name:'노래 연결 저장'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'확인'}));
 await screen.findByRole('alert');expect(document.querySelector('.songs-card')).toBeNull();
});
it('retains staged links and a leave warning when save succeeds but reloading fails',async()=>{
 render(<SongManager locale="en"/>);fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});await waitFor(()=>expect(document.querySelector('.songs-card')).toBeInTheDocument());fireEvent.click(screen.getByText('Song links · 1'));
 fireEvent.change(screen.getByLabelText('YouTube URL: 9'),{target:{value:'https://youtu.be/lmnopqrstuv'}});
 vi.mocked(productionCall).mockImplementation(async(path,method)=>{if(method==='PATCH')return {saved:true};if(path==='productions')throw new ProductionFailure('unavailable');return {songs:[],version:'v2'};});
 fireEvent.click(screen.getByRole('button',{name:'Save song links'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirm'}));
 await screen.findByText(/Links were saved but could not be reloaded/);expect(screen.getByLabelText('YouTube URL: 9')).toHaveValue('https://youtu.be/lmnopqrstuv');
 const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
});
it('treats equivalent URLs and Undo as clean but guards a real production change',async()=>{
 render(<SongManager locale="en"/>);fireEvent.change(await screen.findByLabelText('Choose a production'),{target:{value:'paper-2026'}});await waitFor(()=>expect(document.querySelector('.songs-card')).toBeInTheDocument());fireEvent.click(screen.getByText('Song links · 1'));
 fireEvent.change(screen.getByLabelText('YouTube URL: 9'),{target:{value:'https://www.youtube.com/watch?v=abcdefghijk'}});expect(screen.getByRole('button',{name:'Save song links'})).toBeDisabled();
 let event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Remove link'}));event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Undo change'}));event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
});
