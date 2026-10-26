import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlsPanel } from './ControlsPanel';
import { copy } from './i18n';

afterEach(() => vi.unstubAllGlobals());
function viewport(mobile: boolean) {
  const query = { matches: mobile, addEventListener: vi.fn<(event: string, callback: () => void) => void>(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return query;
}
const panel = (character = '', name = '') => <ControlsPanel character={character} name={name} text={copy.en}><label>Character<select><option>Rowan</option></select></label><button>Context control</button></ControlsPanel>;
describe('responsive settings', () => {
  it('folds after mobile selection, focuses the summary, and reopens without losing settings', () => {
    viewport(true); const { rerender } = render(panel());
    expect(screen.getByLabelText('Character')).toBeVisible();
    rerender(panel('Ro', 'Rowan'));
    const summary = screen.getByRole('button', { name: /Rowan Settings/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');expect(summary).toHaveFocus();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(summary);expect(screen.getByLabelText('Character')).toBeVisible();
    rerender(panel('Ro', 'Rowan'));expect(summary).toHaveAttribute('aria-expanded', 'true');
    rerender(panel('Mi', 'Mira'));expect(summary).toHaveAttribute('aria-expanded', 'false');
    rerender(panel());expect(screen.getByLabelText('Character')).toBeVisible();
  });
  it('keeps desktop settings open and reveals them when resizing from mobile', () => {
    const query=viewport(true);render(panel('Ro','Rowan'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    query.matches=false;act(()=>query.addEventListener.mock.calls[0][1]());
    expect(screen.getByLabelText('Character')).toBeVisible();
  });
});
