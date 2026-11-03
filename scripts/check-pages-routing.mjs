import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

// Exercise the actual Pages asset/router runtime. Synthetic bindings and these
// requests cannot publish content or call the production database/auth provider.
const temporary = resolve('.agent-local/previews/pages-routing');
await mkdir(temporary, { recursive: true });
const socket = createServer();
await new Promise(done => socket.listen(0, '127.0.0.1', done));
const port = socket.address().port;
await new Promise(done => socket.close(done));
const base = `http://127.0.0.1:${port}`;
let log = '';
const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
  'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0',
  '--show-interactive-dev-session', 'false', '--persist-to', resolve(temporary, 'state'),
  '--binding', 'BROWSER_COOKIE_SECRET=synthetic-pages-routing-cookie-key-only',
  '--binding', 'SUPABASE_URL=https://unused.invalid', '--binding', 'SUPABASE_SECRET_KEY=synthetic-local-only',
], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(temporary, 'wrangler.log') }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', data => { log += data; });
child.stderr.on('data', data => { log += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Local Pages runtime exited with ${child.exitCode}`);
    try { if ((await fetch(base, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(done => setTimeout(done, 250));
  }
  assert.ok(ready, 'Local Pages runtime did not start; see ignored pages-routing logs');
  const index = await readFile('dist/index.html', 'utf8');
  const pages = ['/', '/import', '/import/', '/admin', '/admin/', '/admin/scripts?production=synthetic&lang=ko',
    '/admin/accounts', '/admin/songs', '/admin/viewer/', '/admin/assignments?production=synthetic&lang=ko',
    '/admin/roster-preview', '/admin/roster/', '/p/synthetic', '/p/synthetic/'];
  for (const path of pages) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(new URL(response.url).pathname, new URL(path, base).pathname, path + ' must retain its route');
    assert.equal(new URL(response.url).search, new URL(path, base).search, path + ' must retain its query');
    assert.equal(await response.text(), index, path);
    assert.ok(response.headers.get('Content-Security-Policy'), path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', path);
  }
  for (const path of ['/unknown-route', '/.env', '/.git/config', '/data/missing.csv', '/assets/missing.js', '/p/', '/p/a/b', '/admin/missing']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    const body = await response.text();
    assert.match(body, /Page not found/, path);
    assert.ok(!body.includes('<div id="root">'), path);
    assert.ok(!body.includes('cloudflareinsights'), path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', path);
  }
  const asset = index.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  const verification = await fetch(base + '/google253c990321f12879.html');
  assert.equal(verification.status, 200);
  assert.equal((await verification.text()).trim(), 'google-site-verification: google253c990321f12879.html');
  const robots = await fetch(base + '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('Content-Type'), /^text\/plain/);
  assert.match(await robots.text(), /User-agent: Googlebot/);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  assert.equal((await fetch(base + '/api/admin/missing')).status, 404);
  const callback = await fetch(base + '/api/admin/auth/callback?error=access_denied', { redirect: 'manual' });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('Location'), '/admin?auth=failed');
  assert.equal(callback.headers.get('X-Robots-Tag'), 'noindex');
  console.log('Pages routing checks passed: supported deep links, real missing-path 404s, assets, verification and API/OAuth boundaries.');
} finally {
  child.kill('SIGTERM');
  await new Promise(done => { if (child.exitCode !== null) done(); else child.once('exit', done); });
  await writeFile(resolve(temporary, 'runtime.log'), log);
}
