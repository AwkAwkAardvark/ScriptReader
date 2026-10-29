import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startHostedDemo } from './dev-hosted';
import type { AdminAuthFactory } from '../server/admin-auth';

// Local-only identity provider fixture. Production entrypoints never install this factory.
const people = {
  owner: { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test', name: 'Workshop owner' },
  staff: { id: '00000000-0000-4000-8000-000000000002', email: 'staff@example.test', name: 'Workshop staff' },
};
const auth: AdminAuthFactory = (request, _env, headers) => ({
  user: async () => {
    const selected = request.headers.get('Cookie')?.match(/(?:^|;\s*)admin-fixture=(owner|staff)(?:;|$)/)?.[1];
    return selected ? people[selected as keyof typeof people] : null;
  },
  start: async () => new URL('/api/admin/auth/callback?code=owner', request.url).href,
  exchange: async code => {
    if (!(code in people)) return false;
    headers.append('Set-Cookie', `admin-fixture=${code}; HttpOnly; SameSite=Lax; Path=/`);return true;
  },
  signOut: async () => { headers.append('Set-Cookie', 'admin-fixture=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'); },
});
const out = resolve('.agent-local/previews/admin');await mkdir(out, { recursive: true });
const demo = await startHostedDemo(8792, 5182, { adminAuthFactory: auth });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  await demo.rpc('reader_admin_bootstrap', { p_user: people.owner.id, p_email: people.owner.email, p_name: people.owner.name });
  const owner = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const staff = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors: string[] = [];owner.on('pageerror', e => errors.push(e.message));staff.on('pageerror', e => errors.push(e.message));
  await owner.goto(demo.origin + '/admin');
  assert.equal((await owner.request.get(demo.origin + '/api/admin/accounts')).status(), 401);
  await owner.getByRole('button', { name: 'Continue with Google' }).click();
  await owner.getByRole('heading', { name: 'Admin accounts', exact: true }).waitFor();
  await staff.goto(demo.origin + '/api/admin/auth/callback?code=staff');
  await staff.getByRole('button', { name: 'Request access', exact: true }).click();
  await staff.getByText('Awaiting approval', { exact: true }).waitFor();
  assert.equal((await staff.request.get(demo.origin + '/api/admin/accounts')).status(), 403);
  await owner.reload();
  let staffRow = owner.locator('.admin-account').filter({ hasText: people.staff.email });
  await staffRow.getByRole('button', { name: 'Grant access' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await staffRow.locator('.admin-badge').filter({ hasText: /^Admin$/ }).waitFor();
  await staff.reload();await staff.getByRole('button', { name: 'Sign out' }).waitFor();
  assert.equal(await staff.getByRole('heading', { name: 'Admin accounts', exact: true }).count(), 0);
  await staffRow.getByRole('combobox').selectOption('master');
  await staffRow.getByRole('button', { name: 'Save access' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await staffRow.locator('.admin-badge').filter({ hasText: /^Master$/ }).waitFor();
  await staff.reload();await staff.getByRole('heading', { name: 'Admin accounts', exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await owner.setViewportSize({ width, height: 1000 });
    assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await owner.screenshot({ path: join(out, `master-${width}.png`), fullPage: true });
  }
  const self = owner.locator('.admin-account').filter({ hasText: people.owner.email });
  await self.getByRole('combobox').selectOption('admin');await self.getByRole('button', { name: 'Save access' }).click();
  assert.ok(await owner.getByRole('dialog').getByText('This will change your own access.').isVisible());
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await owner.waitForFunction(() => !document.querySelector('.admin-account-group'));
  await staff.reload();
  let oldOwner = staff.locator('.admin-account').filter({ hasText: people.owner.email });
  await oldOwner.getByRole('button', { name: 'Revoke', exact: true }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await oldOwner.getByText('Access revoked', { exact: true }).waitFor();
  assert.equal((await owner.request.get(demo.origin + '/api/admin/accounts')).status(), 403);
  await owner.reload();await owner.getByRole('button', { name: 'Request access again' }).click();
  await owner.getByText('Awaiting approval', { exact: true }).waitFor();
  await staff.reload();oldOwner = staff.locator('.admin-account').filter({ hasText: people.owner.email });
  await oldOwner.getByRole('button', { name: 'Grant access' }).waitFor();
  const last = staff.locator('.admin-account').filter({ hasText: people.staff.email });
  assert.ok(await last.getByRole('button', { name: 'Revoke', exact: true }).isDisabled());
  await staff.getByRole('button', { name: '한국어' }).click();
  await staff.getByRole('heading', { name: '관리자 계정' }).waitFor();
  await staff.screenshot({ path: join(out, 'master-ko-390.png'), fullPage: true });
  await staff.getByRole('button', { name: '로그아웃' }).click();
  await staff.getByRole('button', { name: 'Google로 로그인' }).waitFor();
  assert.equal((await staff.request.get(demo.origin + '/api/admin/accounts')).status(), 401);
  assert.deepEqual(errors, []);
  console.log('Admin browser checks passed: login, requests, approval, handover, revocation/re-request, last-master protection, Korean, mobile/desktop and logout.');
} finally { await browser.close();await demo.close(); }
