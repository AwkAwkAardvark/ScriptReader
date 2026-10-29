import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPanel } from './AdminPanel';
import { adminClient, AdminFailure } from './client';
import type { AdminAccount, AdminSession } from './protocol';
vi.mock('./client', async original => ({ ...(await original<typeof import('./client')>()), adminClient: {
  me: vi.fn(), login: vi.fn(), logout: vi.fn(), request: vi.fn(), accounts: vi.fn(), change: vi.fn(),
} }));
const id = '00000000-0000-4000-8000-000000000001';
const candidate = '00000000-0000-4000-8000-000000000002';
const account = (user_id: string, role: 'admin' | 'master' = 'admin', status: AdminAccount['status'] = 'pending'): AdminAccount => ({
  user_id, email: user_id === id ? 'owner@example.test' : 'staff@example.test', name: user_id === id ? 'Owner' : '<img src=x onerror=alert(1)>',
  role, status, requested_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z',
});
const signedIn = (value: AdminAccount | null): AdminSession => ({ configured: true, user: { id, email: 'owner@example.test', name: 'Owner' }, account: value });
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
});
beforeEach(() => {
  vi.clearAllMocks();window.history.replaceState({}, '', '/admin');
  vi.mocked(adminClient.me).mockResolvedValue({ configured: true, user: null, account: null });
  vi.mocked(adminClient.accounts).mockResolvedValue({ accounts: [] });
});
afterEach(() => { window.history.replaceState({}, '', '/'); });

describe('administration dashboard', () => {
  it('shows Google sign-in without exposing account data or content controls', async () => {
    render(<AdminPanel />);await screen.findByRole('button', { name: 'Continue with Google' });
    expect(adminClient.accounts).not.toHaveBeenCalled();expect(screen.queryByText('Admin accounts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish|upload/i })).not.toBeInTheDocument();
  });
  it('shows an honest configuration state and a generic callback error', async () => {
    vi.mocked(adminClient.me).mockResolvedValue({ configured: false, user: null, account: null });
    window.history.replaceState({}, '', '/admin?auth=failed&error_description=private-data');
    render(<AdminPanel />);await screen.findByText('Google sign-in is not configured yet.');
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in did not complete.');expect(document.body.textContent).not.toContain('private-data');
  });
  it('submits an access request but cannot claim a role', async () => {
    vi.mocked(adminClient.me).mockResolvedValueOnce(signedIn(null)).mockResolvedValue(signedIn(account(id)));
    render(<AdminPanel />);fireEvent.click(await screen.findByRole('button', { name: 'Request access' }));
    await screen.findByText('Awaiting approval');expect(adminClient.request).toHaveBeenCalledWith();expect(adminClient.change).not.toHaveBeenCalled();
  });
  it('allows revoked users to request again without restoring their old role', async () => {
    vi.mocked(adminClient.me).mockResolvedValueOnce(signedIn(account(id, 'admin', 'revoked'))).mockResolvedValue(signedIn(account(id)));
    render(<AdminPanel />);fireEvent.click(await screen.findByRole('button', { name: 'Request access again' }));
    await screen.findByText('Awaiting approval');expect(adminClient.accounts).not.toHaveBeenCalled();
  });
  it('lets masters grant roles through a confirmation dialog and renders names safely', async () => {
    const owner = account(id, 'master', 'approved');
    vi.mocked(adminClient.me).mockResolvedValue(signedIn(owner));
    vi.mocked(adminClient.accounts).mockResolvedValue({ accounts: [owner, account(candidate)] });
    render(<AdminPanel />);await screen.findByText('Admin accounts');
    const selector = await screen.findByRole('combobox', { name: 'Access for staff@example.test' });
    fireEvent.change(selector, { target: { value: 'master' } });fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    const dialog = screen.getByRole('dialog');expect(dialog).toHaveTextContent('staff@example.test');
    expect(dialog.querySelector('img')).toBeNull();expect(adminClient.change).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(adminClient.change).toHaveBeenCalledWith(candidate, 'master'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('does not offer ordinary staff an account directory', async () => {
    vi.mocked(adminClient.me).mockResolvedValue(signedIn(account(id, 'admin', 'approved')));
    render(<AdminPanel />);await screen.findByRole('button', { name: 'Sign out' });
    expect(adminClient.accounts).not.toHaveBeenCalled();expect(screen.queryByText('Admin accounts')).not.toBeInTheDocument();
  });
  it('disables last-master removal and translates the interface', async () => {
    const owner = account(id, 'master', 'approved');
    vi.mocked(adminClient.me).mockResolvedValue(signedIn(owner));vi.mocked(adminClient.accounts).mockResolvedValue({ accounts: [owner] });
    render(<AdminPanel />);await screen.findByText('Master · Last master');
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Access for owner@example.test' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '한국어' }));await screen.findByText('관리자 계정');
    expect(screen.getByRole('button', { name: '해제' })).toBeDisabled();expect(document.documentElement.lang).toBe('ko');
  });
  it('refreshes privileges and removes the directory after self-demotion', async () => {
    const owner = account(id, 'master', 'approved');const next = account(candidate, 'master', 'approved');
    vi.mocked(adminClient.me).mockResolvedValueOnce(signedIn(owner)).mockResolvedValue(signedIn(account(id, 'admin', 'approved')));
    vi.mocked(adminClient.accounts).mockResolvedValue({ accounts: [owner, next] });
    render(<AdminPanel />);const selector = await screen.findByRole('combobox', { name: 'Access for owner@example.test' });
    fireEvent.change(selector, { target: { value: 'admin' } });fireEvent.click(within(selector.closest('li')!).getByRole('button', { name: 'Save access' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('This will change your own access.');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.queryByText('Admin accounts')).not.toBeInTheDocument());
  });
  it('shows permission failures without retaining the account directory', async () => {
    const owner = account(id, 'master', 'approved');
    vi.mocked(adminClient.me).mockResolvedValueOnce(signedIn(owner)).mockResolvedValue(signedIn(account(id, 'admin', 'revoked')));
    vi.mocked(adminClient.accounts).mockResolvedValue({ accounts: [owner, account(candidate)] });
    vi.mocked(adminClient.change).mockRejectedValueOnce(new AdminFailure('forbidden'));
    render(<AdminPanel />);fireEvent.click(await screen.findByRole('button', { name: 'Grant access' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('alert');await waitFor(() => expect(screen.queryByText('Admin accounts')).not.toBeInTheDocument());
  });
  it('ignores an aborted initial load', async () => {
    let resolve!: (value: AdminSession) => void;
    vi.mocked(adminClient.me).mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = render(<AdminPanel />);view.unmount();
    await act(async () => resolve({ configured: true, user: null, account: null }));
    expect(adminClient.accounts).not.toHaveBeenCalled();
  });
});
