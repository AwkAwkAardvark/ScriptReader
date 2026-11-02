import type { AdminAction, AdminAccount, AdminError, AdminSession } from './protocol';
export class AdminFailure extends Error {
  constructor(public code: AdminError) { super(code); }
}
const errorCodes = new Set<AdminError>(['unauthorized', 'forbidden', 'invalid_request', 'not_found', 'last_master', 'master_limit', 'unavailable', 'auth_not_ready']);
async function call<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/admin/' + path, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new AdminFailure(errorCodes.has(result?.error) ? result.error : 'unavailable');
  return result as T;
}
export const adminClient = {
  me: (signal?: AbortSignal) => call<AdminSession>('me', 'GET', undefined, signal),
  login: () => call<{ url: string }>('auth/start', 'POST'),
  logout: () => call('auth/logout', 'POST'),
  request: () => call('requests', 'POST'),
  accounts: (signal?: AbortSignal) => call<{ accounts: AdminAccount[] }>('accounts', 'GET', undefined, signal),
  displayName: (id:string,name:string|null)=>call<{account:AdminAccount}>('accounts/'+encodeURIComponent(id)+'/display-name','PATCH',{name}),
  change: (id: string, role: AdminAction) => call('accounts/' + encodeURIComponent(id), 'PATCH', { role }),
};
