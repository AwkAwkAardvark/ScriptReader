import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Report locations and rule names only. Never print matched credential values.
const rules = [
  ['Supabase server key', /sb_secret_[A-Za-z0-9_-]{25,}/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];
let sourcePaths;
try { sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch { console.error('Unable to enumerate repository files. Run this check in the Git checkout.'); process.exit(1); }
const files = new Set(sourcePaths.split('\0').filter(Boolean));
const artifacts = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path); else { files.add(path); artifacts.push(path); }
  }
}
walk('dist');
const findings = [];
for (const path of files) {
  if (!statSync(path).isFile()) continue;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [rule, pattern] of rules) if (pattern.test(text)) findings.push({ path, rule });
  for (const jwt of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    try { if (JSON.parse(Buffer.from(jwt[0].split('.')[1], 'base64url').toString()).role === 'service_role') findings.push({ path, rule: 'Privileged Supabase JWT' }); } catch { /* Non-JWT source text. */ }
  }
}
for (const path of artifacts) {
  if (readFileSync(path).includes(Buffer.from('PRIVATE_STUDENT_FIXTURE'))) findings.push({ path, rule: 'Student fixture in public artifact' });
  if (/\.(?:map|csv|tsv|xlsx?|sql|tsx?)$/i.test(path) || /(?:^|\/)\.(?:env|git)(?:[./]|$)/.test(path)) findings.push({ path, rule: 'Private or development artifact' });
}
const demo = '.agent-local/demo/ScriptReader-demo.html';
try { if (readFileSync(demo).includes(Buffer.from('PRIVATE_STUDENT_FIXTURE'))) findings.push({ path: demo, rule: 'Student fixture in offline demo' }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (findings.length) { console.error(JSON.stringify({ exposureFindings: findings }, null, 2)); process.exitCode = 1; }
else console.log(`Exposure check passed (${files.size} source/artifact files; no recognized credentials or private deployment artifacts).`);
