import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../node_modules/modern-web-guidance/skills/modern-web-guidance/modern-web.mjs', import.meta.url));
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit', env: { ...process.env, DISABLE_TELEMETRY: '1' }, shell: false,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
