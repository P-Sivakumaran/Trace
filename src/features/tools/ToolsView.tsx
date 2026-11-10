import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { Entity, ProjectData } from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import { TOOL_CATALOG, normaliseToolInput, type ToolSpec } from '@/services/tools/catalog';
import { CodeBlock } from '@/components/common/CodeBlock';
import { toolOutputToBatch } from '@/services/tools/parsers';
import type { ImportBatch } from '@/services/import/types';
import { Select } from '@/components/common/Select';

interface ToolsViewProps {
  projectData: ProjectData | null;
  selectedEntityId?: string | null;
  /** Hand a parsed run result to the import review dialog. */
  onReviewBatch: (batch: ImportBatch) => void;
}

type Selection = { kind: 'tool'; id: string } | { kind: 'mcp' };
type Status = Awaited<ReturnType<NonNullable<NonNullable<Window['electronAPI']>['tools']>['status']>>;
type McpStatus = Awaited<ReturnType<NonNullable<NonNullable<Window['electronAPI']>['mcp']>['status']>>;
type LogLine = { line: string; stream: string };
type RunResult = { tool: string; value: string; batch: ImportBatch; hits: number; summary: string; failed?: boolean };

const MAX_LOG = 600;

/**
 * Tools: a small marketplace of external OSINT tools that run on this machine,
 * plus the read-only MCP server switch. Tool output never goes straight into
 * the case — it is turned into an import batch and reviewed first.
 */
export const ToolsView: React.FC<ToolsViewProps> = ({ projectData, selectedEntityId, onReviewBatch }) => {
  const api = window.electronAPI?.tools;
  const mcpApi = window.electronAPI?.mcp;
  const [status, setStatus] = useState<Status | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [sel, setSel] = useState<Selection>({ kind: 'tool', id: TOOL_CATALOG[0].id });
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [busy, setBusy] = useState<Record<string, 'install' | 'uninstall' | 'run'>>({});
  const [runIds, setRunIds] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [pythonBusy, setPythonBusy] = useState(false);
  const [pythonError, setPythonError] = useState('');

  const refresh = async () => {
    if (api) setStatus(await api.status());
    if (mcpApi) setMcp(await mcpApi.status());
  };

  useEffect(() => {
    refresh();
    if (!api) return;
    return api.onLog(({ runId, line, stream }) =>
      setLogs((prev) => {
        const next = [...(prev[runId] || []), { line, stream }];
        return { ...prev, [runId]: next.length > MAX_LOG ? next.slice(-MAX_LOG) : next };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installed = (id: string) => status?.tools.find((t) => t.id === id);

  const install = async (spec: ToolSpec) => {
    if (!api) return;
    const logKey = `install:${spec.id}`;
    setLogs((p) => ({ ...p, [logKey]: [] }));
    setErrors((p) => ({ ...p, [spec.id]: '' }));
    setBusy((p) => ({ ...p, [spec.id]: 'install' }));
    const r = await api.install(spec.id);
    if (!r.ok) setErrors((p) => ({ ...p, [spec.id]: r.error || 'Installation failed' }));
    setBusy((p) => {
      const { [spec.id]: _, ...rest } = p;
      return rest;
    });
    refresh();
  };

  const installPython = async () => {
    if (!api) return;
    setLogs((p) => ({ ...p, 'install:python': [] }));
    setPythonBusy(true);
    setPythonError('');
    const r = await api.installPython();
    if (!r.ok) setPythonError(r.error || 'Python installation failed');
    setPythonBusy(false);
    refresh();
  };

  const uninstall = async (spec: ToolSpec) => {
    if (!api) return;
    setBusy((p) => ({ ...p, [spec.id]: 'uninstall' }));
    const r = await api.uninstall(spec.id);
    if (!r.ok) setErrors((p) => ({ ...p, [spec.id]: r.error || 'Uninstall failed' }));
    setBusy((p) => {
      const { [spec.id]: _, ...rest } = p;
      return rest;
    });
    refresh();
  };

  const run = async (spec: ToolSpec, rawInput: string, target?: Entity) => {
    if (!api) return;
    const input = normaliseToolInput(spec.input.kind, rawInput);
    if (!input.ok) {
      setErrors((p) => ({ ...p, [spec.id]: input.error }));
      return;
    }
    const runId = `run-${spec.id}-${Date.now().toString(36)}`;
    setRunIds((p) => ({ ...p, [spec.id]: runId }));
    setLogs((p) => ({ ...p, [runId]: [] }));
    setErrors((p) => ({ ...p, [spec.id]: '' }));
    setResults((p) => {
      const { [spec.id]: _, ...rest } = p;
      return rest;
    });
    setBusy((p) => ({ ...p, [spec.id]: 'run' }));
    const r = await api.run(spec.id, input.value, runId);
    setBusy((p) => {
      const { [spec.id]: _, ...rest } = p;
      return rest;
    });
    if (!r.ok) {
      setErrors((p) => ({ ...p, [spec.id]: r.error }));
      return;
    }
    const batch = toolOutputToBatch(spec, { value: r.value, entity: target ? { type: target.type, name: target.name } : undefined }, r.stdout, new Date(r.startedAt));
    const hits = batch.entities.length - 1;
    const secs = Math.round(r.durationMs / 1000);
    const summary = r.cancelled
      ? `Cancelled after ${secs}s — ${hits} result(s) so far`
      : r.timedOut
        ? `Stopped at the ${spec.timeoutSec}s limit — ${hits} result(s) so far`
        : r.exitCode === 0
          ? `Finished in ${secs}s — ${hits} result(s)`
          : `Exited with code ${r.exitCode} after ${secs}s — ${hits} result(s)`;
    setResults((p) => ({ ...p, [spec.id]: { tool: spec.name, value: r.value, batch, hits, summary, failed: r.exitCode !== 0 && !r.cancelled && !r.timedOut } }));
  };

  const cancel = async (spec: ToolSpec) => {
    const id = runIds[spec.id];
    if (api && id) await api.cancel(id);
  };

  const toggleMcp = async () => {
    if (!mcpApi || !mcp) return;
    await mcpApi.setEnabled(!mcp.enabled);
    setMcp(await mcpApi.status());
  };

  const spec = sel.kind === 'tool' ? TOOL_CATALOG.find((t) => t.id === sel.id)! : null;
  const q = query.trim().toLowerCase();
  const matches = (t: ToolSpec) => !q || `${t.name} ${t.tagline} ${t.category} ${t.pip.package}`.toLowerCase().includes(q);
  const installedTools = TOOL_CATALOG.filter((t) => installed(t.id)?.installed && matches(t));
  const available = TOOL_CATALOG.filter((t) => !installed(t.id)?.installed && matches(t));
  const categories = [...new Set(available.map((t) => t.category))];

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] text-[12px]">
      <div className="h-[32px] shrink-0 flex items-center gap-2 px-3 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <span className="t-label">Tools</span>
        <span className="text-[11px] text-zinc-500 truncate max-[1100px]:hidden">External OSINT tools run on this computer · results are reviewed before they enter the case</span>
        <div className="flex-1" />
        {status && status.python.found && (
          <span className="font-mono text-[10.5px] whitespace-nowrap text-zinc-500" title={status.python.command}>
            {status.python.managed ? 'portable python' : 'python'} {status.python.version}
          </span>
        )}
        {status && !status.python.found && (
          <>
            <span className="text-[11px] whitespace-nowrap text-amber-400">Python not found</span>
            <button type="button" className="t-btn !h-[22px]" disabled={pythonBusy} onClick={installPython} title="Download a portable Python 3.12 for TRACE (about 25 MB, checksum-verified, no admin rights)">
              {pythonBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {pythonBusy ? 'Installing Python…' : 'Install Python'}
            </button>
          </>
        )}
        <button type="button" className="t-icon-btn" title="Refresh" onClick={refresh}>
          <RefreshCw />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* List */}
        <aside className="w-[260px] max-[1280px]:w-[200px] shrink-0 border-r border-[var(--t-border)] bg-[var(--t-panel)] overflow-y-auto">
          {mcpApi && (
            <>
              <ListHead title="Integrations" />
              <ListRow active={sel.kind === 'mcp'} onClick={() => setSel({ kind: 'mcp' })}>
                <Bot className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="flex-1 truncate">MCP server</span>
                <Pill on={!!mcp?.enabled}>{mcp?.enabled ? 'On' : 'Off'}</Pill>
              </ListRow>
            </>
          )}

          <ListHead title={`Installed · ${installedTools.length}`} />
          {installedTools.length === 0 && <div className="px-3 py-1.5 text-[11px] text-zinc-600">Nothing installed yet.</div>}
          {installedTools.map((t) => (
            <ToolRow key={t.id} spec={t} active={sel.kind === 'tool' && sel.id === t.id} busy={busy[t.id]} onClick={() => setSel({ kind: 'tool', id: t.id })} version={installed(t.id)?.version} />
          ))}

          <ListHead title="Marketplace" />
          <div className="px-2 pb-1">
            <input
              className="t-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${TOOL_CATALOG.length} tools…`}
              spellCheck={false}
              aria-label="Search tools"
            />
          </div>
          {available.length === 0 && (
            <div className="px-3 py-1.5 text-[11px] text-zinc-600">{q ? 'No tools match.' : 'All catalog tools are installed.'}</div>
          )}
          {categories.map((cat) => (
            <div key={cat}>
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-600">{cat}</div>
              {available
                .filter((t) => t.category === cat)
                .map((t) => (
                  <ToolRow key={t.id} spec={t} active={sel.kind === 'tool' && sel.id === t.id} busy={busy[t.id]} onClick={() => setSel({ kind: 'tool', id: t.id })} />
                ))}
            </div>
          ))}
        </aside>

        {/* Detail */}
        <section className="flex-1 min-w-0 overflow-y-auto">
          {(pythonBusy || pythonError || (logs['install:python']?.length ?? 0) > 0) && (
            <PythonPanel busy={pythonBusy} error={pythonError} log={logs['install:python'] || []} />
          )}
          {sel.kind === 'mcp' && mcpApi ? (
            <McpPanel mcp={mcp} available={!!mcpApi} onToggle={toggleMcp} />
          ) : (
            spec && (
              <ToolPanel
                key={spec.id}
                spec={spec}
                desktop={!!api}
                pythonFound={status?.python.found ?? true}
                state={installed(spec.id)}
                busy={busy[spec.id]}
                error={errors[spec.id]}
                log={logs[busy[spec.id] === 'install' || !runIds[spec.id] ? `install:${spec.id}` : runIds[spec.id]] || []}
                result={results[spec.id]}
                projectData={projectData}
                selectedEntityId={selectedEntityId}
                onInstall={() => install(spec)}
                onUninstall={() => uninstall(spec)}
                onRun={(v, e) => run(spec, v, e)}
                onCancel={() => cancel(spec)}
                onReview={(b) => onReviewBatch(b)}
              />
            )
          )}
        </section>
      </div>
    </div>
  );
};

/** Tool logo; falls back to the initial when the image cannot load (offline). */
const ToolLogo: React.FC<{ spec: ToolSpec; className: string }> = ({ spec, className }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`${className} rounded-[3px] overflow-hidden bg-[var(--t-raised)] border border-[var(--t-border)] flex items-center justify-center font-semibold text-zinc-300 shrink-0`}>
      {spec.image && !failed ? (
        <img src={spec.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        spec.name[0]
      )}
    </span>
  );
};

const PythonPanel: React.FC<{ busy: boolean; error: string; log: LogLine[] }> = ({ busy, error, log }) => (
  <div className="max-w-[860px] px-5 pt-4 space-y-2">
    <div className="t-label">{busy ? 'Installing portable Python…' : error ? 'Python installation failed' : 'Python installed'}</div>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="max-h-[140px] overflow-y-auto rounded-[3px] border border-[var(--t-border)] bg-[#0c0c0e] px-2.5 py-2 font-mono text-[11px] leading-[1.55] select-text">
      {log.map((l, i) => (
        <div key={i} className={l.stream === 'stderr' ? 'text-rose-300/80' : l.stream === 'info' ? 'text-[var(--t-accent)]' : 'text-zinc-400'}>
          {l.line}
        </div>
      ))}
    </div>
  </div>
);

const ListHead: React.FC<{ title: string }> = ({ title }) => (
  <div className="h-[26px] flex items-center px-3 mt-1">
    <span className="t-label">{title}</span>
  </div>
);

const ListRow: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full h-[30px] flex items-center gap-2 px-3 text-left ${active ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-300 hover:bg-[var(--t-hover)]'}`}
  >
    {children}
  </button>
);

const Pill: React.FC<{ on?: boolean; children: React.ReactNode }> = ({ on, children }) => (
  <span className={`text-[10px] px-1.5 h-[16px] leading-[16px] rounded-[2px] border ${on ? 'border-emerald-500/40 text-emerald-400' : 'border-[var(--t-border)] text-zinc-500'}`}>
    {children}
  </span>
);

const ToolRow: React.FC<{ spec: ToolSpec; active: boolean; busy?: string; version?: string; onClick: () => void }> = ({ spec, active, busy, version, onClick }) => (
  <ListRow active={active} onClick={onClick}>
    <ToolLogo spec={spec} className="w-[18px] h-[18px] text-[10px]" />
    <span className="flex-1 min-w-0">
      <span className="block truncate">{spec.name}</span>
    </span>
    {busy ? (
      <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
    ) : version ? (
      <span className="font-mono text-[10px] text-zinc-600">{version}</span>
    ) : null}
  </ListRow>
);

interface ToolPanelProps {
  spec: ToolSpec;
  desktop: boolean;
  pythonFound: boolean;
  state?: { installed: boolean; version?: string; installedAt?: string };
  busy?: 'install' | 'uninstall' | 'run';
  error?: string;
  log: LogLine[];
  result?: RunResult;
  projectData: ProjectData | null;
  selectedEntityId?: string | null;
  onInstall: () => void;
  onUninstall: () => void;
  onRun: (value: string, entity?: Entity) => void;
  onCancel: () => void;
  onReview: (batch: ImportBatch) => void;
}

const ToolPanel: React.FC<ToolPanelProps> = ({ spec, desktop, pythonFound, state, busy, error, log, result, projectData, selectedEntityId, onInstall, onUninstall, onRun, onCancel, onReview }) => {
  const candidates = useMemo(
    () => (projectData?.entities || []).filter((e) => spec.input.entityTypes.includes(e.type)).sort((a, b) => a.name.localeCompare(b.name)),
    [projectData, spec],
  );
  const preselected = candidates.find((e) => e.id === selectedEntityId);
  const [entityId, setEntityId] = useState<string>(preselected?.id ?? '');
  const [value, setValue] = useState<string>(preselected ? preselected.name.replace(/^@/, '') : '');
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log.length]);

  const entity = candidates.find((e) => e.id === entityId);
  const isInstalled = !!state?.installed;
  const running = busy === 'run';

  return (
    <div className="max-w-[860px] px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <ToolLogo spec={spec} className="w-9 h-9 text-[15px]" />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold text-zinc-50">{spec.name}</h2>
            {isInstalled && <span className="font-mono text-[10.5px] text-zinc-500">{state?.version}</span>}
          </div>
          <div className="text-zinc-400">{spec.tagline}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>{spec.category}</span>
            <span>{spec.license}</span>
            <span>pip: <span className="font-mono">{spec.pip.package}</span></span>
            <span>{spec.durationHint}</span>
            <a href={spec.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--t-accent)] hover:underline">
              Project page <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!desktop ? (
            <span className="text-[11px] text-zinc-500">Desktop app only</span>
          ) : isInstalled ? (
            <button
              type="button"
              className={`t-btn ${confirmUninstall ? '!text-rose-300 !border-rose-500/50' : ''}`}
              disabled={!!busy}
              onClick={() => (confirmUninstall ? (setConfirmUninstall(false), onUninstall()) : setConfirmUninstall(true))}
              onBlur={() => setConfirmUninstall(false)}
            >
              <Trash2 className="w-3.5 h-3.5 opacity-70" />
              {confirmUninstall ? 'Click to confirm' : 'Uninstall'}
            </button>
          ) : (
            <button type="button" className="t-btn t-btn-primary" disabled={!!busy} onClick={onInstall}>
              {busy === 'install' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {busy === 'install' ? 'Installing…' : 'Install'}
            </button>
          )}
        </div>
      </div>

      <p className="text-zinc-300 leading-relaxed">{spec.description}</p>

      {desktop && !pythonFound && !isInstalled && (
        <Notice>
          Python was not found on this computer. Installing will first download a portable Python 3.12 for TRACE (about 25 MB, checksum-verified,
          no admin rights, stored in TRACE's data folder).
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {isInstalled && (
        <div className="rounded-[4px] border border-[var(--t-border)] bg-[var(--t-panel)]">
          <div className="px-3 py-2.5 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 min-w-[220px] flex-1">
              <span className="text-[11px] text-zinc-500">Case entity</span>
              <Select
                className="t-input"
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  const ent = candidates.find((c) => c.id === e.target.value);
                  if (ent) setValue(ent.name.replace(/^@/, ''));
                }}
                disabled={running}
              >
                <option value="">— none (results get a new {spec.input.kind === 'email' ? 'email' : 'account'} entity) —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 min-w-[200px] flex-1">
              <span className="text-[11px] text-zinc-500">{spec.input.label}</span>
              <input
                className="t-input font-mono"
                value={value}
                placeholder={spec.input.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !running && value.trim() && onRun(value, entity)}
                disabled={running}
                spellCheck={false}
              />
            </label>
            {running ? (
              <button type="button" className="t-btn" onClick={onCancel}>
                <Square className="w-3 h-3" />
                Stop
              </button>
            ) : (
              <button type="button" className="t-btn t-btn-primary" disabled={!value.trim() || !!busy} onClick={() => onRun(value, entity)}>
                <Play className="w-3 h-3" />
                Run
              </button>
            )}
          </div>
          {entity && (
            <div className="px-3 pb-2 -mt-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
              Results will be linked to
              <span style={{ color: getEntityTypeColor(entity.type) }} className="inline-flex">
                <EntityIcon type={entity.type} className="w-3 h-3" />
              </span>
              <span className="text-zinc-300">{entity.name}</span>
            </div>
          )}
          {result && (
            <div className="px-3 py-2 border-t border-[var(--t-border-subtle)] flex items-center gap-2">
              {result.failed ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="text-zinc-300">{result.summary}</span>
              <div className="flex-1" />
              <button type="button" className="t-btn t-btn-primary" disabled={result.hits === 0 || !projectData} onClick={() => onReview(result.batch)}>
                Review & add to case
              </button>
            </div>
          )}
        </div>
      )}

      {(log.length > 0 || busy === 'install' || running) && (
        <div>
          <div className="t-label mb-1.5">{busy === 'install' || (!running && !result) ? 'Install log' : 'Output'}</div>
          <div ref={logRef} className="h-[260px] overflow-y-auto rounded-[3px] border border-[var(--t-border)] bg-[#0c0c0e] px-2.5 py-2 font-mono text-[11px] leading-[1.55] select-text">
            {log.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${l.stream === 'stderr' ? 'text-zinc-500' : l.stream === 'info' ? 'text-[var(--t-accent)]' : /^\[\+\]/.test(l.line) ? 'text-emerald-300/90' : 'text-zinc-300'}`}>
                {l.line}
              </div>
            ))}
            {(busy === 'install' || running) && <div className="text-zinc-600 animate-pulse">…</div>}
          </div>
        </div>
      )}

      <div className="text-[11px] text-zinc-600 leading-relaxed">
        Installed into an isolated Python environment inside TRACE's data folder; uninstalling removes it completely. The tool contacts the
        listed websites directly from your computer. Findings are added as <span className="text-zinc-400">Candidate</span> links tagged with the tool name, with the
        original output line kept as provenance.
      </div>
    </div>
  );
};

const Notice: React.FC<{ tone?: 'warn' | 'error'; children: React.ReactNode }> = ({ tone = 'warn', children }) => (
  <div
    className={`px-2.5 py-2 rounded-[3px] border text-[11.5px] ${
      tone === 'error' ? 'border-rose-500/30 bg-rose-950/20 text-rose-300' : 'border-amber-500/30 bg-amber-950/10 text-amber-300/90'
    }`}
  >
    {children}
  </div>
);

const McpPanel: React.FC<{ mcp: McpStatus | null; available: boolean; onToggle: () => void }> = ({ mcp, available, onToggle }) => {
  const json = mcp
    ? JSON.stringify({ mcpServers: { trace: { command: mcp.command, args: mcp.args, env: mcp.env } } }, null, 2)
    : '';
  const cli = mcp ? `claude mcp add trace -e ELECTRON_RUN_AS_NODE=1 -- "${mcp.command}" "${mcp.args[0]}"` : '';

  return (
    <div className="max-w-[860px] px-5 py-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[4px] bg-[var(--t-raised)] border border-[var(--t-border)] flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-zinc-50">MCP server</h2>
          <div className="text-zinc-400">Let AI agents read your investigations — read-only</div>
        </div>
        {available && mcp && (
          <button
            type="button"
            role="switch"
            aria-checked={mcp.enabled}
            onClick={onToggle}
            title={mcp.enabled ? 'Turn MCP access off' : 'Turn MCP access on'}
            className={`mt-1 w-9 h-[20px] rounded-full p-[2px] flex transition-colors ${mcp.enabled ? 'bg-[var(--t-accent)] justify-end' : 'bg-zinc-700 justify-start'}`}
          >
            <span className="w-4 h-4 rounded-full bg-white" />
          </button>
        )}
      </div>

      {!available ? (
        <Notice>The MCP server is available in the desktop app.</Notice>
      ) : (
        mcp && (
          <>
            <div className={`text-[12px] ${mcp.enabled ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {mcp.enabled
                ? 'On — connected AI clients can list and read the cases in your workspace.'
                : 'Off — AI clients get no tools and no data, even if they are configured.'}
            </div>
            {!mcp.available && <Notice>The server bundle was not found ({mcp.args[0]}). Run “npm run build:mcp” in a source checkout.</Notice>}
            <p className="text-zinc-300 leading-relaxed">
              Agents can list cases, search entities, read entity and relationship details, walk neighbourhoods, follow evidence and find paths
              between entities. They cannot create, edit or delete anything. The switch takes effect immediately; no client restart needed.
            </p>
            <CodeBlock label="Claude Desktop / any MCP client (JSON config)" text={json} lang="json" />
            <CodeBlock label="Claude Code" text={cli} lang="shell" />
            <div className="text-[11px] text-zinc-600">
              Workspace: <span className="font-mono">{mcp.workspacePath}</span>
            </div>
          </>
        )
      )}
    </div>
  );
};
