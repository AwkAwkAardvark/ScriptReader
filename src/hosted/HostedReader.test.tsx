import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HostedReader } from './HostedReader';
import { loadProduction, loadPassages, ApiFailure } from './client';
import { passageBundle } from '../../server/passages';
import { preparePublication } from '../../server/publishing';
import { csvFor } from '../test/fixtures';
import { ReadingContent } from '../ReadingContent';
import { unpackView } from './protocol';
import { copy } from '../i18n';

vi.mock('./client', async importOriginal => {
  const original = await importOriginal<typeof import('./client')>();
  return { ...original, loadProduction: vi.fn(), loadPassages: vi.fn() };
});
const production = { slug: 'garden', title: 'Paper garden', revision: '00000000-0000-4000-8000-000000000001', characters: [{ tag: 'Ro', label: 'Rowan Reed' }, { tag: 'Mi', label: 'Mira Moss' }], used: 0, resetAt: '2099-01-01T15:00:00Z' };
const payload = preparePublication(csvFor(), 'Tag,Name\nRo,Rowan Reed\nMi,Mira Moss', 'No,YouTubeURL\n9,https://youtu.be/abcdefghijk\n17,https://youtu.be/lmnopqrstuv');
beforeEach(() => {
  vi.mocked(loadProduction).mockReset().mockResolvedValue(production);
  vi.mocked(loadPassages).mockReset().mockImplementation(async (_slug, _revision, character, counts) => passageBundle({ ...production, used: 1 }, payload, character, counts));
});
async function select() {
  const user = userEvent.setup();
  render(<HostedReader slug="garden" />);
  await waitFor(() => expect(screen.getByLabelText('Character')).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('Character'), 'Ro');
  await screen.findByText('The gate is open. Shall we take a look?');
  return user;
}
describe('hosted reader', () => {
  it('defaults to 2/1, uses preloaded views without extra calls, and fetches larger context', async () => {
    const user = await select();
    expect(screen.getByRole('heading', { level: 1, name: production.title })).toBeVisible();
    expect(document.querySelector('.controls')).not.toHaveTextContent(production.title);
    expect(screen.getByRole('button', { name: 'Print / Save PDF' }).closest('.controls')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
    expect(loadPassages).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('radio', { name: '±1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled());
    expect(loadPassages).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('radio', { name: '±5' }));
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
    await waitFor(() => expect(loadPassages).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('checkbox', { name: 'Display Korean lines' }));
    expect(await screen.findByText('문이 열려 있어요.')).toBeInTheDocument();
    expect(loadPassages).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: '한국어' }));
    expect(screen.getByRole('button', { name: '인쇄 / PDF 저장' })).toBeEnabled();
    expect(loadPassages).toHaveBeenCalledTimes(2);
  });
  it('fetches uncached cues and reuses the previously cached mode', async () => {
    const user = await select();
    await user.click(screen.getByRole('checkbox', { name: 'Include actions & cues' }));
    await waitFor(() => expect(loadPassages).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('checkbox', { name: 'Include actions & cues' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled());
    expect(loadPassages).toHaveBeenCalledTimes(2);
  });
  it('handles quota failure and permits reopening a cached character', async () => {
    const user = await select();
    vi.mocked(loadPassages).mockRejectedValueOnce(new ApiFailure({ error: 'quota', resetAt: production.resetAt }));
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(await screen.findByRole('alert')).toHaveTextContent('Daily character allowance reached.');
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Character'), 'Ro');
    expect(await screen.findByText('The gate is open. Shall we take a look?')).toBeInTheDocument();
  });
  it('rejects stale responses after rapid character changes', async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadPassages>>) => void;
    vi.mocked(loadPassages).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup(); render(<HostedReader slug="garden" />);
    await waitFor(() => expect(screen.getByLabelText('Character')).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await waitFor(() => expect(loadPassages).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText('Character'), 'Ro');
    await screen.findByText('The gate is open. Shall we take a look?');
    await act(async () => finish(passageBundle(production, payload, 'Mi', { before: 2, after: 1, includeNonDialogue: false })));
    expect(screen.getByRole('heading', { name: 'Rowan Reed' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mira Moss' })).not.toBeInTheDocument();
  });
  it('clears old views on revision change and reloads metadata', async () => {
    const user = await select();
    vi.mocked(loadPassages).mockRejectedValueOnce(new ApiFailure({ error: 'revision_changed' }));
    await user.click(screen.getByRole('radio', { name: '±5' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The script has been updated.');
    expect(screen.queryByText('The gate is open. Shall we take a look?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload script' }));
    await waitFor(() => expect(loadProduction).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Character')).toHaveValue('');
  });
  it('debounces changing custom counts and preserves validation', async () => {
    const user = await select();
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '9' } });
    await waitFor(() => expect(loadPassages).toHaveBeenCalledTimes(2));
    expect(vi.mocked(loadPassages).mock.calls[1][3].before).toBe(9);
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '11' } });
    expect(screen.getByLabelText('Before')).toHaveAttribute('aria-invalid', 'true');
  });
});
it('mounts YouTube only on click, switches players, collapses and includes the external fallback', async () => {
  const user = userEvent.setup();
  const counts = { before: 2, after: 1, includeNonDialogue: false };
  const bundle = passageBundle(production, payload, 'Ro', counts);
  render(<ReadingContent document={unpackView(bundle, counts, false)!} text={copy.en} media={bundle.media} />);
  expect(document.querySelector('iframe')).toBeNull();
  const buttons = screen.getAllByRole('button', { name: /Play video:/ });
  expect(buttons).toHaveLength(2);
  await user.click(buttons[0]);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
  await user.click(buttons[1]);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(document.querySelector('iframe')).toHaveAttribute('src', expect.stringContaining('lmnopqrstuv'));
  await user.click(buttons[1]); expect(document.querySelector('iframe')).toBeNull();
});
