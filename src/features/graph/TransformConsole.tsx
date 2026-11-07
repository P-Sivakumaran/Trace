import React, { useState } from 'react';
import { TransformLogEntry } from '@/services/transforms/types';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface TransformConsoleProps {
  logs: TransformLogEntry[];
  activeTransformName?: string;
  activeEntityName?: string;
  isRunning: boolean;
  onClearLogs: () => void;
  className?: string;
}

const STATUS_MARK: Record<string, { mark: string; cls: string }> = {
  success: { mark: 'OK ', cls: 'text-emerald-400' },
  error: { mark: 'ERR', cls: 'text-rose-400' },
  warning: { mark: 'WRN', cls: 'text-amber-400' },
  running: { mark: '…  ', cls: 'text-zinc-400' },
};

/**
 * Docked transform console under the canvas: a one-line status strip that
 * expands into a monospace log table.
 */
export const TransformConsole: React.FC<TransformConsoleProps> = ({
  logs,
  activeTransformName,
  activeEntityName,
  isRunning,
  onClearLogs,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  const filteredLogs = logs.filter((log) => (filter === 'all' ? true : log.status === filter));
  const errors = logs.filter((l) => l.status === 'error').length;
  const last = logs[0];

  return (
    <div className={`shrink-0 border-t border-[var(--t-border)] bg-[var(--t-panel)] select-none text-[11.5px] ${className}`}>
      <div className="h-[24px] flex items-center gap-2 pl-2.5 pr-1">
        <button
          type="button"
          onClick={() => setIsExpanded((p) => !p)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200"
          title={isExpanded ? 'Collapse console' : 'Expand console'}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          <span className="t-label !text-inherit">Transforms</span>
        </button>
        <div className="flex-1 min-w-0 truncate text-zinc-500">
          {isRunning ? (
            <span className="text-zinc-300 inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {activeTransformName} <span className="text-zinc-500">on</span> {activeEntityName}
            </span>
          ) : last ? (
            <span>
              {last.transformName} <span className="text-zinc-600">on</span> {last.entityName}
              {last.entitiesAdded ? <span className="text-zinc-400"> · +{last.entitiesAdded} entities</span> : null}
              {last.relationshipsAdded ? <span className="text-zinc-400"> · +{last.relationshipsAdded} links</span> : null}
            </span>
          ) : (
            <span className="text-zinc-600">Idle — run transforms from an entity’s context menu or the inspector.</span>
          )}
        </div>
        {logs.length > 0 && (
          <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums">
            {logs.length} runs{errors > 0 && <span className="text-rose-400"> · {errors} err</span>}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="h-[180px] flex flex-col border-t border-[var(--t-border-subtle)]">
          <div className="h-[24px] flex items-center gap-0.5 px-1.5 border-b border-[var(--t-border-subtle)]">
            {(['all', 'success', 'error'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2 h-[20px] rounded-[2px] capitalize ${
                  filter === f ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                {f}
              </button>
            ))}
            <div className="flex-1" />
            {logs.length > 0 && (
              <button type="button" onClick={onClearLogs} className="px-2 h-[20px] text-zinc-500 hover:text-zinc-200">
                Clear
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] bg-[var(--t-bg)] select-text">
            {filteredLogs.map((log) => {
              const st = STATUS_MARK[log.status] || STATUS_MARK.running;
              return (
                <div key={log.id} className="flex items-baseline gap-2 px-2.5 py-[2px] border-b border-[var(--t-border-subtle)] hover:bg-[var(--t-hover)]">
                  <span className="text-zinc-600 shrink-0 tabular-nums">{log.timestamp}</span>
                  <span className={`${st.cls} shrink-0 whitespace-pre`}>{st.mark}</span>
                  <span className="text-zinc-300 shrink-0">{log.transformName}</span>
                  <span className="text-zinc-500 shrink-0 max-w-[180px] truncate">{log.entityName}</span>
                  <span className="text-zinc-400 flex-1 min-w-0 break-words">{log.message}</span>
                  {log.durationMs !== undefined && <span className="text-zinc-600 shrink-0 tabular-nums">{log.durationMs}ms</span>}
                </div>
              );
            })}
            {filteredLogs.length === 0 && <div className="px-2.5 py-2 text-zinc-600">No entries.</div>}
          </div>
        </div>
      )}
    </div>
  );
};
