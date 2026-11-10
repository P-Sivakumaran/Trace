/**
 * TRACE MCP server (stdio, JSON-RPC 2.0) — READ ONLY.
 *
 * Usage:  node dist-mcp/trace-mcp.mjs [--workspace <path>]
 * Workspace resolution: --workspace > $TRACE_WORKSPACE > desktop app config > ~/Documents/trace
 *
 * Only `initialize`, `ping`, `tools/list` and `tools/call` are implemented.
 * stdout carries protocol messages only; diagnostics go to stderr.
 */
import readline from 'node:readline';
import { WorkspaceReader, isMcpAccessEnabled, resolveWorkspacePath } from '@/core/fsWorkspace';
import { TOOL_DEFINITIONS, callTool, type ProjectSource } from './tools';

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_LINE = 1024 * 1024;

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
}

export const DISABLED_MESSAGE =
  'TRACE MCP access is turned off. Enable it in the TRACE app: Tools → MCP server.';

/**
 * @param isEnabled checked on every request, so the in-app switch takes effect
 *        immediately without restarting the client.
 */
export function createMcpHandler(source: ProjectSource, serverVersion: string, isEnabled: () => boolean = () => true) {
  return async function handle(msg: JsonRpcRequest): Promise<object | null> {
    const isNotification = msg.id === undefined;
    const reply = (result: unknown) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id ?? null, result });
    const fail = (code: number, message: string) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: (msg as any)?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, any>;

    switch (msg.method) {
      case 'initialize': {
        const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        return reply({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'trace', title: 'TRACE investigations (read-only)', version: serverVersion },
          instructions:
            'Read-only access to local TRACE OSINT investigations. Call list_projects first, then get_project_summary. ' +
            'Investigations are graphs: entities connected by relationships; each relationship has a verification status, ' +
            'an evidence class (observed / hypothesis / disproven) and evidence sources. This server cannot modify data.',
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: isEnabled() ? TOOL_DEFINITIONS : [] });
      case 'tools/call': {
        if (typeof params.name !== 'string') return fail(-32602, 'Invalid params: name is required');
        if (!isEnabled()) return reply({ content: [{ type: 'text', text: DISABLED_MESSAGE }], isError: true });
        const result = await callTool(source, params.name, params.arguments);
        if (!result.ok) return reply({ content: [{ type: 'text', text: result.error }], isError: true });
        return reply({
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          structuredContent: result.data,
        });
      }
      default:
        return fail(-32601, `Method not found: ${msg.method.slice(0, 64)}`);
    }
  };
}

function parseArgs(argv: string[]): { workspace?: string } {
  const i = argv.indexOf('--workspace');
  return i >= 0 && argv[i + 1] ? { workspace: argv[i + 1] } : {};
}

export function main() {
  const workspace = resolveWorkspacePath(parseArgs(process.argv.slice(2)).workspace);
  const reader = new WorkspaceReader(workspace);
  // The in-app switch (trace-config.json → mcpEnabled) governs access whenever
  // the desktop app is present; re-read on every request.
  const isEnabled = () => isMcpAccessEnabled();
  const handle = createMcpHandler(reader, __APP_VERSION__, isEnabled);
  process.stderr.write(
    `[trace-mcp] read-only server ${__APP_VERSION__}, projects: ${reader.root}, access: ${isEnabled() ? 'enabled' : 'disabled in app'}\n`,
  );

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (obj: object) => process.stdout.write(JSON.stringify(obj) + '\n');

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    if (line.length > MAX_LINE) return send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } });
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (Array.isArray(msg)) return send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported' } });
    try {
      const res = await handle(msg as JsonRpcRequest);
      if (res) send(res);
    } catch {
      send({ jsonrpc: '2.0', id: (msg as any)?.id ?? null, error: { code: -32603, message: 'Internal error' } });
    }
  });
  rl.on('close', () => process.exit(0));
}
