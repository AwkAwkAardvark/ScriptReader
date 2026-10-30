import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {CsvExample} from './CsvExample';
import {assignmentExample} from './assignment-example';
it('uses the same collapsed disclosure and accessible scrollable code region for assignment examples',()=>{
 const sample=assignmentExample([{tag:'Gua1',label:'Guard One'}]);
 render(<CsvExample kind="assignments" locale="en" value={sample} note="Fictional students"/>);
 const summary=screen.getByText('CSV example');expect(summary.closest('details')).not.toHaveAttribute('open');fireEvent.click(summary);
 const code=screen.getByLabelText('Assignment CSV example');expect(code.tagName).toBe('PRE');expect(code).toHaveAttribute('tabindex','0');expect(code.textContent).toBe(sample);expect(screen.getByText('Fictional students')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Download example',hidden:true})).toBeInTheDocument();
});
it('keeps preparation details relevant to the file rather than repeating the script excerpt note',()=>{
 const view=render(<CsvExample kind="script" locale="ko" expanded/>);expect(screen.getByText('3장 발췌 · 원본 번호 유지')).toBeInTheDocument();expect(screen.getByLabelText('대본 CSV 예시')).toHaveTextContent('107,3,,Market Mayhem');
 view.rerender(<CsvExample kind="cast" locale="ko" expanded/>);expect(screen.queryByText('3장 발췌 · 원본 번호 유지')).not.toBeInTheDocument();expect(screen.getByLabelText('등장인물 CSV 예시')).toHaveTextContent('Mer1,Merchant Sept');
});
