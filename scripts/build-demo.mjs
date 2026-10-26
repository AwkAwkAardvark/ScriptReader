import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// Build first. Inline only Vite's generated assets; never read scripts or cast inputs.
const root = resolve('dist');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const script = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!script || !style) throw new Error('Expected one built entry script and stylesheet. Run npm run build first.');
const mime = { '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
async function inlineAssets(content) {
  const paths = [...new Set(content.match(/\/assets\/[\w.-]+/g) ?? [])];
  for (const path of paths) {
    const type = mime[extname(path)];
    if (!type) throw new Error(`Unsupported external asset: ${path}`);
    const data = await readFile(resolve(root, '.' + path));
    content = content.replaceAll(path, `data:${type};base64,${data.toString('base64')}`);
  }
  return content;
}
const js = await inlineAssets(await readFile(resolve(root, '.' + script[1]), 'utf8'));
const css = await inlineAssets(await readFile(resolve(root, '.' + style[1]), 'utf8'));
const license = await readFile('src/assets/fonts/OFL.txt', 'utf8');
html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(style[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
html = html.replace('</body>', () => `<template id="bundled-font-license">${license.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</template>\n</body>`);
const output = resolve('.agent-local/demo/ScriptReader-demo.html');
await mkdir(resolve('.agent-local/demo'), { recursive: true });
await writeFile(output, html);
console.log(`Offline demo: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
