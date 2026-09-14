// Send only the requested server credentials via stdin; never print their values.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const allowed = ['ZHIHU_OAUTH_APP_KEY', 'ZHIHU_ACCESS_SECRET'];
const values = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(line => allowed.some(key => line.startsWith(key + '='))).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim()]; }));
if (allowed.some(key => !values[key])) throw new Error('Required server credentials are missing');
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', 'dist/server/wrangler.json'], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
child.stdin.end(JSON.stringify(values));
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Unable to start secret configuration'); process.exitCode = 1; });
