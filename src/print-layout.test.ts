import { expect, it, vi } from 'vitest';
import { preparePrintLayout } from './print-layout';
it('relaxes break avoidance only for groups and entries taller than an A4 content page, and recalculates', () => {
  const root = document.createElement('div');
  root.innerHTML = '<section class="passage-window"><article class="script-entry"></article></section>';
  const group = root.firstElementChild as HTMLElement;
  const entry = group.firstElementChild as HTMLElement;
  const groupSize = vi.spyOn(group, 'getBoundingClientRect').mockReturnValue({ height: 1800 } as DOMRect);
  vi.spyOn(entry, 'getBoundingClientRect').mockReturnValue({ height: 75 } as DOMRect);
  preparePrintLayout(root);
  expect(group).toHaveClass('print-split');
  expect(entry).not.toHaveClass('print-split');
  groupSize.mockReturnValue({ height: 500 } as DOMRect);
  preparePrintLayout(root);
  expect(group).not.toHaveClass('print-split');
});
