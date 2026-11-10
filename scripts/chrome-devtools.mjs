import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const paths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright'), join(process.env.LOCALAPPDATA || homedir(), 'ms-playwright')];
for (const cache of caches) {
  if (!existsSync(cache)) continue;
  for (const entry of readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    for (const suffix of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe']) paths.push(join(cache, entry, suffix));
  }
}
if (process.env.TRACE_CHROME_PATH && (!isAbsolute(process.env.TRACE_CHROME_PATH) || !existsSync(process.env.TRACE_CHROME_PATH))) throw new Error('TRACE_CHROME_PATH must be an existing absolute Chrome executable path');
const executable = process.env.TRACE_CHROME_PATH || paths.find(path => existsSync(path));
const args = ['--headless', '--isolated', '--no-usage-statistics', '--no-performance-crux'];
if (executable) args.push('--executablePath', executable);
// Never forward connection/profile flags from callers: use a fresh development browser.
const child = spawn(process.execPath, [join(root, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'), ...args], {
  cwd: root, stdio: 'inherit', shell: false,
  env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
