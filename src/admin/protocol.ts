export type AdminRole = 'admin' | 'master';
export type AccessStatus = 'none' | 'pending' | 'approved' | 'revoked';
export type AdminAccount = {
  user_id: string; email: string; name: string; role: AdminRole; status: Exclude<AccessStatus, 'none'>;
  requested_at: string; updated_at: string;
};
export type AdminIdentity = { id: string; email: string; name: string };
export type AdminSession = { configured: boolean; user: AdminIdentity | null; account: AdminAccount | null };
export type AdminAction = AdminRole | 'revoked';
export type AdminError = 'unauthorized' | 'forbidden' | 'invalid_request' | 'not_found' | 'last_master' | 'master_limit' | 'unavailable' | 'auth_not_ready';
