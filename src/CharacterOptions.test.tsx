import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { CharacterOptions } from './CharacterOptions';

it('keeps dividers unselectable, omits a leading divider, and preserves identities and duplicate names', async () => {
  const user = userEvent.setup();
  render(<select aria-label="Character" defaultValue="Ro"><CharacterOptions characters={[
    { tag: 'Ro', label: 'Keeper', dividerBefore: true },
    { tag: 'Mi', label: 'Keeper', dividerBefore: true },
    { tag: 'Sp', label: 'Sprite' },
  ]} /></select>);
  const select = screen.getByRole('combobox');
  const options = screen.getAllByRole('option') as HTMLOptionElement[];
  expect(options.map(option => option.text)).toEqual(['Keeper (Ro)', '────────', 'Keeper (Mi)', 'Sprite']);
  expect(options[1]).toBeDisabled();
  await user.selectOptions(select, options[1]);
  expect(select).toHaveValue('Ro');
  await user.selectOptions(select, 'Mi');
  expect(select).toHaveValue('Mi');
});
