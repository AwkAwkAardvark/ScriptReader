import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RosterPreview } from './RosterPreview';
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
it('keeps same-name students distinct using classes and existing role context without displaying IDs',()=>{
 render(<RosterPreview locale="en" onLocale={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG'}));
 const dialog=screen.getByRole('dialog');expect(within(dialog).getAllByText('김민준')).toHaveLength(2);
 expect(within(dialog).getAllByText('Same name and class — check current roles')).toHaveLength(2);
 expect(dialog.textContent).not.toContain('sample-a');
 fireEvent.click(within(dialog).getByRole('button',{name:/김민준 · EPI · 2부 Guard One/}));
 expect(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPI'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));
 expect(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG'})).toBeInTheDocument();
});
it('allows optional distinguishing labels and updates every role belonging to that student',()=>{
 render(<RosterPreview locale="en" onLocale={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG'}));
 fireEvent.click(screen.getByRole('button',{name:'Edit details: 김민준 · 1부 Guard One, 1부 Merchant Two'}));
 fireEvent.change(screen.getByLabelText('Distinguishing label (optional)'),{target:{value:'Red team'}});
 fireEvent.click(screen.getByRole('button',{name:'Update sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 expect(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG · Red team'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Merchant Two · 1부: 김민준 · EPG · Red team'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Review changes'}));
 expect(screen.getByRole('dialog')).toHaveTextContent('These changes apply only to this sample.');
 fireEvent.click(screen.getByRole('button',{name:'Apply to sample'}));expect(screen.getByRole('status')).toHaveTextContent('Sample updated.');
});
it('adds a separate duplicate-name student without merging and never calls a persistence API',()=>{
 const fetch=vi.spyOn(globalThis,'fetch');
 render(<RosterPreview locale="en" onLocale={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Add student'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'김민준'}});fireEvent.change(screen.getByLabelText('Class'),{target:{value:'EPG'}});
 fireEvent.click(screen.getByRole('button',{name:'Update sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG'}));
 expect(within(screen.getByRole('dialog')).getAllByText('김민준')).toHaveLength(3);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
it('provides disclosure navigation with Escape support and Korean text',()=>{
 const onLocale=vi.fn();render(<RosterPreview locale="ko" onLocale={onLocale}/>);
 const toggle=screen.getByRole('button',{name:'메뉴'});fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-expanded','true');
 fireEvent.keyDown(screen.getByRole('navigation'),{key:'Escape'});expect(toggle).toHaveAttribute('aria-expanded','false');expect(toggle).toHaveFocus();
 expect(screen.queryByRole('menu')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'ENG'}));expect(onLocale).toHaveBeenCalledWith('en');
});

it('does not invent a change when clearing an already empty role',()=>{
 render(<RosterPreview locale="en" onLocale={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Merchant One · 2부: Unassigned'}));
 fireEvent.click(screen.getByRole('button',{name:'Clear assignment'}));
 expect(screen.getByRole('button',{name:'Review changes'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Undo'})).toBeDisabled();
});
