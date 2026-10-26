import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { localDatabase } from '../server/local-database';
import { preparePublication } from '../server/publishing';
import { handleApi } from '../server/api';
import { csvFor } from '../src/test/fixtures';

export async function startHostedDemo(apiPort = 8788, webPort = 5173) {
  const { db, rpc } = await localDatabase();
  const payload = preparePublication(csvFor(), 'Tag,Name\nRo,Rowan Reed\nMi,Mira Moss\nA1,Visitor One\nA2,Visitor Two\nA3,Visitor Three\nA4,Visitor Four', 'No,YouTubeURL\n9,https://youtu.be/abcdefghijk\n17,https://youtu.be/lmnopqrstuv');
  await rpc('reader_publish', { p_slug: 'synthetic-garden', p_title: 'The paper garden — test production', p_payload: payload });
  const server = createHttpServer(async (req, res) => {
    const parts: Buffer[] = []; let length = 0;
    for await (const part of req) { length += part.length; if (length > 4096) { res.writeHead(413); res.end(); return; } parts.push(part); }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const method = req.method ?? 'GET';
    const request = new Request(`http://127.0.0.1:${webPort}${req.url}`, { method, headers, ...(method !== 'GET' && method !== 'HEAD' ? { body: Buffer.concat(parts) } : {}) });
    const response = await handleApi(request, { SUPABASE_URL: 'https://unused.invalid', SUPABASE_SECRET_KEY: 'local-only', BROWSER_COOKIE_SECRET: 'synthetic-development-cookie-secret-ONLY' }, rpc);
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>(resolve => server.listen(apiPort, '127.0.0.1', resolve));
  const vite = await createViteServer({ server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
  await vite.listen();
  return { db, rpc, origin: `http://127.0.0.1:${webPort}`, close: async () => { await vite.close(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = await startHostedDemo();
  console.log(`${demo.origin}/p/synthetic-garden (fictional data; cleared on shutdown)`);
  process.on('SIGINT', () => { void demo.close().then(() => process.exit()); });
}
