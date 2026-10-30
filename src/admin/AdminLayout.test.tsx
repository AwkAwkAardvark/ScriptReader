import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AdminLayout,adminDestination,replaceAdminUrl} from './AdminLayout';
let media:{matches:boolean;addEventListener:ReturnType<typeof vi.fn>;removeEventListener:ReturnType<typeof vi.fn>};
beforeEach(()=>{window.history.replaceState({},'','/admin/scripts?production=workshop&lang=ko&auth=failed');media={matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('matchMedia',()=>media);});
afterEach(()=>vi.unstubAllGlobals());
it('shares active navigation with production/language context and respects account permissions',()=>{
 render(<AdminLayout page="scripts" locale="ko" onLocale={vi.fn()}><p>Page content</p></AdminLayout>);
 expect(screen.getByRole('link',{name:'공연 대본'})).toHaveAttribute('aria-current','page');
 expect(screen.getByRole('link',{name:'노래'})).toHaveAttribute('href','/admin/songs?production=workshop&lang=ko');
 expect(screen.queryByRole('link',{name:'권한 관리'})).not.toBeInTheDocument();
 act(()=>replaceAdminUrl('/admin/scripts?production=second&auth=failed'));
 expect(screen.getByRole('link',{name:'배역 배정'})).toHaveAttribute('href','/admin/roster?production=second&lang=ko');
 expect(adminDestination('/admin/songs','en','../../private')).toBe('/admin/songs');
});
it('collapses desktop navigation without hiding content and restores button focus with Escape',()=>{
 render(<AdminLayout page="scripts" locale="en" onLocale={vi.fn()} master><p>Page content</p></AdminLayout>);
 const button=screen.getByRole('button',{name:'Navigation'});expect(button).toHaveAttribute('aria-expanded','true');
 fireEvent.keyDown(screen.getByRole('navigation'),{key:'Escape'});expect(button).toHaveFocus();expect(button).toHaveAttribute('aria-expanded','false');
 expect(screen.queryByRole('navigation')).not.toBeInTheDocument();expect(screen.getByText('Page content')).toBeInTheDocument();
 fireEvent.click(button);expect(screen.getByRole('link',{name:'Access Management'})).toBeInTheDocument();
});
it('keeps in-flow mobile navigation stable when focus moves to a content action',()=>{
 media.matches=false;render(<AdminLayout page="roster" locale="en" onLocale={vi.fn()}><button>Content action</button></AdminLayout>);
 const button=screen.getByRole('button',{name:'Navigation'});expect(button).toHaveAttribute('aria-expanded','false');fireEvent.click(button);
 fireEvent.blur(screen.getByRole('link',{name:'Scripts'}),{relatedTarget:screen.getByRole('button',{name:'Content action'})});
 expect(button).toHaveAttribute('aria-expanded','true');
 fireEvent.keyDown(screen.getByRole('navigation'),{key:'Escape'});expect(button).toHaveAttribute('aria-expanded','false');
});
it('starts the teacher workspace without an expanded admin sidebar, and hides privileged links from pending users',()=>{
 const view=render(<AdminLayout page="viewer" locale="en" onLocale={vi.fn()}><p>Script</p></AdminLayout>);
 expect(screen.getByRole('button',{name:'Navigation'})).toHaveAttribute('aria-expanded','false');view.unmount();
 render(<AdminLayout page="overview" locale="en" onLocale={vi.fn()} approved={false}><p>Pending</p></AdminLayout>);
 expect(screen.getByRole('link',{name:'My Account'})).toBeInTheDocument();expect(screen.queryByRole('link',{name:'Roster'})).not.toBeInTheDocument();
});

it('provides a reader return link on signed-out layouts without staff navigation',()=>{
 render(<AdminLayout page="scripts" locale="en" onLocale={vi.fn()} navigation={false} approved={false}><p>Sign in</p></AdminLayout>);
 expect(screen.getByRole('link',{name:'Open student reader'})).toHaveAttribute('href','/');expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
