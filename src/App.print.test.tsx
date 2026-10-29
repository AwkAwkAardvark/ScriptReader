import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { csvFor } from './test/fixtures';
import { preparePrintFont } from './print-font';

vi.mock('./print-font', () => ({ preparePrintFont: vi.fn() }));
const font = vi.mocked(preparePrintFont);
beforeEach(() => { font.mockReset().mockResolvedValue(); });
async function select() {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Script file'), new File([csvFor()], 'synthetic.csv', { type: 'text/csv' }));
  await waitFor(() => expect(screen.getByLabelText('Character')).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('Character'), 'Ro');
  return user;
}
describe('print readiness and current view', () => {
  it('requires a valid selection and loaded font before opening the print dialog', async () => {
    let finish!: () => void;
    font.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<App />);
    const button = screen.getByRole('button', { name: 'Print / Save PDF' });
    expect(button).toBeDisabled();
    const user = await select();
    expect(button).toBeDisabled();
    await act(async () => finish());
    expect(button).toBeEnabled();
    await user.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText('Character'), '');
    expect(button).toBeDisabled();
    print.mockRestore();
  });
  it('reports a localized failure, retries, and prints only the current Korean/text selection', async () => {
    font.mockRejectedValueOnce(new Error('offline failure')).mockResolvedValueOnce(undefined);
    render(<App />);
    const user = await select();
    await user.click(screen.getByRole('button', { name: '한국어' }));
    expect(screen.getByText('인쇄 글꼴을 불러올 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인쇄 / PDF 저장' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '인쇄 / PDF 저장' })).toBeEnabled());
    await user.click(screen.getByRole('checkbox', { name: '한국어 표기' }));
    expect(screen.getByText('문이 열려 있어요.')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-record="2"]')).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: '한국어 표기' }));
    expect(screen.queryByText('문이 열려 있어요.')).not.toBeInTheDocument();
  });
  it('disables print for replacement/import errors and an unused roster character', async () => {
    render(<App />);
    const user = await select();
    const button = screen.getByRole('button', { name: 'Print / Save PDF' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.upload(screen.getByLabelText('Cast file'), new File(['Tag,Name\nRo,Rowan\nMi,Mira\nUn,Unused'], 'cast.csv', { type: 'text/csv' }));
    await screen.findByRole('option', { name: 'Unused' });
    await user.selectOptions(screen.getByLabelText('Character'), 'Un');
    expect(button).toBeDisabled();
    await user.upload(screen.getByLabelText('Script file'), new File(['broken'], 'bad.csv', { type: 'text/csv' }));
    expect(button).toBeDisabled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Script file'), { target: { files: [] } });
    expect(button).toBeDisabled();
  });
});
