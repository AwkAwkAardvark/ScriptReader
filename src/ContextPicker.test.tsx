import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ContextPicker } from './ContextPicker';
import { copy } from './i18n';

it('previews pointer changes but commits only the final independent values on release', () => {
  const onChange = vi.fn();
  render(<ContextPicker value={{ before: 2, after: 1 }} onChange={onChange} disabled={false} text={copy.en} />);
  const before = screen.getByRole('slider', { name: 'Before' });
  fireEvent.pointerDown(before, { pointerId: 1 });
  fireEvent.change(before, { target: { value: '4' } });
  fireEvent.change(before, { target: { value: '5' } });
  expect(before).toHaveValue('5');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.pointerUp(before, { pointerId: 1 });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ before: 5, after: 1 });
});

it('cancels an interrupted drag and follows externally changed values', () => {
  const onChange = vi.fn();
  const { rerender } = render(<ContextPicker value={{ before: 2, after: 1 }} onChange={onChange} disabled={false} text={copy.en} />);
  const after = screen.getByRole('slider', { name: 'After' });
  fireEvent.pointerDown(after, { pointerId: 1 });
  fireEvent.change(after, { target: { value: '5' } });
  fireEvent.pointerCancel(after, { pointerId: 1 });
  expect(after).toHaveValue('1');
  expect(onChange).not.toHaveBeenCalled();
  rerender(<ContextPicker value={{ before: 0, after: 3 }} onChange={onChange} disabled={false} text={copy.ko} />);
  expect(screen.getByRole('slider', { name: '앞' })).toHaveValue('0');
  expect(screen.getByRole('slider', { name: '뒤' })).toHaveValue('3');
});

it('commits non-pointer changes immediately and exposes native limits and disabled state', () => {
  const onChange = vi.fn();
  const { rerender } = render(<ContextPicker value={{ before: 2, after: 1 }} onChange={onChange} disabled={false} text={copy.en} />);
  const after = screen.getByRole('slider', { name: 'After' });
  expect(after).toHaveAttribute('min', '0');expect(after).toHaveAttribute('max', '5');expect(after).toHaveAttribute('step', '1');
  fireEvent.change(after, { target: { value: '0' } });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ before: 2, after: 0 });
  rerender(<ContextPicker value={{ before: 2, after: 0 }} onChange={onChange} disabled text={copy.en} />);
  expect(after).toBeDisabled();
});
