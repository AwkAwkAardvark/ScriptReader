import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useUnsavedChanges} from './useUnsavedChanges';
function Example({dirty=true,busy=false,action=vi.fn()}:{dirty?:boolean;busy?:boolean;action?:()=>void}){const guard=useUnsavedChanges(dirty,'en',busy);return <><button onClick={()=>guard.request(action)}>Switch production</button><a href="/admin/songs">Songs</a><a href="#section">Section</a><a href="/admin/viewer" target="_blank">New tab</a><a href="/download" download>Download</a><a href="/admin/scripts" onClick={event=>event.preventDefault()}>Prevented</a>{guard.prompt}</>;}
beforeEach(()=>{window.history.replaceState({},'','/admin/scripts');HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
const unload=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};
it('keeps the operation unchanged until explicit discard, focuses Keep editing and treats Escape as cancel',()=>{
 const action=vi.fn();render(<Example action={action}/>);fireEvent.click(screen.getByRole('button',{name:'Switch production'}));expect(action).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'Unsaved changes'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Keep editing'})).toHaveFocus();fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(action).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Switch production'}));fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));expect(action).toHaveBeenCalledOnce();expect(unload()).toBe(true);
});
it('only enables unload warnings for dirty preparation, including during a save',()=>{
 const view=render(<Example dirty={false} busy/>);expect(unload()).toBe(false);fireEvent.click(screen.getByRole('link',{name:'Songs'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();view.rerender(<Example dirty busy/>);expect(unload()).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Switch production'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('leaves new tabs, downloads, same-page jumps and intentional prevented handlers alone',()=>{
 render(<Example/>);for(const name of ['New tab','Download','Section','Prevented']){fireEvent.click(screen.getByRole('link',{name}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();}
 fireEvent.click(screen.getByRole('link',{name:'Songs'}));expect(screen.getByRole('dialog',{name:'Unsaved changes'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(unload()).toBe(true);
});
it('consumes the explicit-departure bypass once and restores warning after returning from page cache',()=>{
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});render(<Example/>);fireEvent.click(screen.getByRole('link',{name:'Songs'}));fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));expect(unload()).toBe(false);expect(unload()).toBe(true);
 fireEvent.click(screen.getByRole('link',{name:'Songs'}));fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));fireEvent(window,new Event('pageshow'));expect(unload()).toBe(true);error.mockRestore();
});
