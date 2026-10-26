import type { Production, ApiCode } from '../src/hosted/protocol';
import type { PublishedPayload } from './publishing';
export type FetchArgs = {
  p_slug: string; p_browser: string; p_ip: string; p_new_browser: boolean;
  p_character: string | null; p_revision: string | null;
  p_browser_limit: number; p_ip_limit: number; p_identity_limit: number;
};
export type FetchResult = { production: Production; payload?: PublishedPayload } |
  { error: ApiCode; resetAt?: string; retryAfter?: number };
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export function supabaseRpc(url: string, key: string): Rpc {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:') throw new Error('Supabase requires HTTPS');
  return async (name, args) => {
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    // New secret keys are API keys, not JWTs. Legacy service_role JWTs also need Bearer.
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, endpoint), {
      method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Database request failed');
    return response.json();
  };
}
