import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {SongLinksEditor} from './SongLinksEditor';

it('leads with a clean heading while preserving source title, line ID and external destination',()=>{
 const songs=[{no:9,title:'(Song: Paper Sky (Reprise))',video:'abcdefghijk'},{no:10,title:'(Song: Paper Sky) (Reprise)'}];const original=structuredClone(songs);
 render(<SongLinksEditor songs={songs} edits={{}} onChange={vi.fn()} locale="en"/>);
 expect(screen.getByRole('heading',{name:'Paper Sky (Reprise)'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'(Song: Paper Sky) (Reprise)'})).toBeInTheDocument();
 expect(screen.getByText('Line 9').tagName).toBe('EM');
 const link=screen.getByRole('link',{name:'Open current video'});expect(link).toHaveAttribute('href','https://youtu.be/abcdefghijk');expect(link).toHaveAttribute('target','_blank');
 link.focus();expect(link).toHaveFocus();expect(screen.queryByText('Existing link')).not.toBeInTheDocument();expect(songs).toEqual(original);
});
it('keeps unavailable video actions genuinely disabled and cannot activate them by keyboard focus',()=>{
 const onChange=vi.fn();render(<SongLinksEditor songs={[{no:142,title:'A sample song'}]} edits={{}} onChange={onChange} locale="en"/>);
 const action=screen.getByRole('button',{name:'Open current video'});expect(action).toBeDisabled();action.focus();expect(action).not.toHaveFocus();
 fireEvent.click(action);expect(onChange).not.toHaveBeenCalled();expect(screen.queryByRole('link',{name:'Open current video'})).not.toBeInTheDocument();expect(screen.queryByText('No link')).not.toBeInTheDocument();
});
it('localizes the line reference and keeps removal pending explicit with an undo action',()=>{
 const onChange=vi.fn();const songs=[{no:9,title:'(Song: A sample song)',video:'abcdefghijk'}];
 render(<SongLinksEditor songs={songs} edits={{9:null}} onChange={onChange} locale="ko"/>);
 expect(screen.getByText('9번 줄')).toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('연결 삭제 예정');expect(screen.getByRole('button',{name:'현재 동영상 열기'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'변경 취소'}));expect(onChange).toHaveBeenCalledWith({});expect(songs[0].title).toBe('(Song: A sample song)');
});
