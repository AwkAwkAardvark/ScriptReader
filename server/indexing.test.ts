import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';

const env = {
  SUPABASE_URL: 'https://unused.invalid',
  SUPABASE_SECRET_KEY: 'synthetic-test-only',
  BROWSER_COOKIE_SECRET: 'synthetic-indexing-cookie-key-not-a-credential',
};

describe('deployed API indexing policy', () => {
  it.each(['/api/missing', '/api/admin/missing'])('retains error status and uncached responses on %s', async path => {
    const response = await onRequest({ request: new Request('https://reader.example' + path), env });
    expect(response.status).toBe(404);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('preserves the OAuth failure redirect and private cache policy', async () => {
    const response = await onRequest({ request: new Request('https://reader.example/api/admin/auth/callback?error=access_denied'), env });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/admin?auth=failed');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
