import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const root = fileURLToPath(new URL('..', import.meta.url));
const client = new Client({ name: 'trace-development-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./chrome-devtools.mjs', import.meta.url))], cwd: root, stderr: 'pipe' });
let diagnostics = '';
const deadline = setTimeout(() => { console.error('Chrome MCP smoke timed out'); void client.close().finally(() => process.exit(1)); }, 60000);
try {
  await client.connect(transport);
  transport.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  const { tools } = await client.listTools();
  for (const name of ['new_page', 'take_snapshot', 'evaluate_script']) assert.ok(tools.some(tool => tool.name === name));
  const page = await client.callTool({ name: 'new_page', arguments: { url: 'data:text/html,<title>Trace development smoke</title><main><h1>Isolated browser check</h1></main>' } });
  assert.ok(!page.isError, JSON.stringify(page));
  const pageText = page.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  const match = pageText.match(/^(\d+): Trace development smoke /m);
  assert.ok(match, pageText);
  const snapshot = await client.callTool({ name: 'take_snapshot', arguments: { pageId: Number(match[1]) } });
  assert.ok(!snapshot.isError && JSON.stringify(snapshot).includes('Isolated browser check'), JSON.stringify(snapshot));
  console.log(`Chrome DevTools MCP OK: ${tools.length} tools, isolated Chrome launch, synthetic page and accessibility snapshot.`);
} catch (error) {
  console.error(diagnostics);
  throw error;
} finally { clearTimeout(deadline); await client.close(); }
