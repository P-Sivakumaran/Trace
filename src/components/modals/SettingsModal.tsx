import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  Download,
  RefreshCw,
  Trash2,
  Keyboard,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { ReleaseNotes } from '@/components/common/ReleaseNotes';
import { useReleaseNotes } from '@/services/updates/useReleaseNotes';
import type { ProjectSummary, StorageUsage, Workspace } from '@/types';
import { formatBytes } from '@/utils/format';
import { checkForUpdates, RELEASES_PAGE_URL, type UpdateCheckResult } from '@/services/updates/updateChecker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace?: Workspace | null;
  activeProjectId?: string;
  isDesktop?: boolean;
  onSelectDirectory?: () => void;
  onOpenInExplorer?: (projectId?: string) => void;
  onExportZip: () => void;
  onRebuildIndex: () => void;
  onOpenShortcuts: () => void;
  /** Changes whenever cases are added or removed, so the usage numbers refresh. */
  projectsVersion?: ProjectSummary[];
  loadStorageUsage?: () => Promise<StorageUsage>;
  /** Opens the delete confirmation for a case. */
  onDeleteProject?: (projectId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  workspace,
  activeProjectId,
  isDesktop = false,
  onSelectDirectory,
  onOpenInExplorer,
  onExportZip,
  onRebuildIndex,
  onOpenShortcuts,
  projectsVersion,
  loadStorageUsage,
  onDeleteProject,
}) => {
  const [physicsBounce, setPhysicsBounce] = useState<boolean>(() => {
    return localStorage.getItem('trace_settings_physics') !== 'false';
  });
  const [defaultLayout, setDefaultLayout] = useState<string>(() => {
    return localStorage.getItem('trace_settings_layout') || 'cose';
  });
  const [auraGlow, setAuraGlow] = useState<boolean>(() => {
    return localStorage.getItem('trace_settings_aura') !== 'false';
  });
  const [resetConfirm, setResetConfirm] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'checking'>('idle');
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);

  const handleCheckForUpdates = async () => {
    if (updateState === 'checking') return;
    setUpdateState('checking');
    setUpdateResult(null);
    // Non-blocking: the dialog and app stay interactive while this resolves.
    const result = await checkForUpdates(__APP_VERSION__);
    setUpdateResult(result);
    setUpdateState('idle');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePhysicsToggle = () => {
    const next = !physicsBounce;
    setPhysicsBounce(next);
    localStorage.setItem('trace_settings_physics', String(next));
  };

  const handleAuraToggle = () => {
    const next = !auraGlow;
    setAuraGlow(next);
    localStorage.setItem('trace_settings_aura', String(next));
  };

  const handleLayoutChange = (layout: string) => {
    setDefaultLayout(layout);
    localStorage.setItem('trace_settings_layout', layout);
  };

  const handleClearData = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    localStorage.clear();
    window.location.reload();
  };

  const storagePath = workspace?.workspacePath || workspace?.name || '~/Documents/trace';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/55"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--t-panel)] border border-[#2e2f34] rounded-[4px] w-full max-w-[760px] shadow-popover flex flex-col max-h-[85vh] overflow-hidden text-[12px]">
        {/* Header */}
        <div className="h-[48px] shrink-0 flex items-center justify-between pl-5 pr-3 border-b border-[var(--t-border)]">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-zinc-100 leading-tight">Application Settings</h2>
            <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">Storage, graph and keyboard preferences</p>
          </div>
          <button type="button" onClick={onClose} className="t-icon-btn" title="Close  (Esc)">
            <X />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Section title="Workspace & File System">
            <Row
              label={isDesktop ? 'Working directory' : 'Browser offline storage'}
              description={isDesktop ? 'Folder where case Markdown files are stored' : 'Cases are stored in this browser profile'}
              stacked
            >
              <div
                className="h-[26px] px-2.5 flex items-center rounded-[3px] bg-[var(--t-bg)] border border-[var(--t-border)] font-mono text-[11px] text-zinc-400 truncate select-all"
                title={storagePath}
              >
                {storagePath}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {isDesktop && onSelectDirectory && (
                  <button type="button" onClick={onSelectDirectory} className="t-btn">
                    <Folder className="w-3.5 h-3.5 opacity-70" />
                    Change folder
                  </button>
                )}
                {onOpenInExplorer && (
                  <button type="button" onClick={() => onOpenInExplorer(activeProjectId)} className="t-btn">
                    <FolderOpen className="w-3.5 h-3.5 opacity-70" />
                    {isDesktop ? 'Show in Finder' : 'Download project files'}
                  </button>
                )}
              </div>
            </Row>
            <Row label="Export project" description="Canonical Markdown structure as a .zip archive">
              <button type="button" onClick={onExportZip} className="t-btn" disabled={!activeProjectId}>
                <Download className="w-3.5 h-3.5 opacity-70" />
                Export .zip
              </button>
            </Row>
            <Row label="Search index" description="Rebuild the SQLite full-text index from Markdown files">
              <button type="button" onClick={onRebuildIndex} className="t-btn" disabled={!activeProjectId}>
                <RefreshCw className="w-3.5 h-3.5 opacity-70" />
                Rebuild index
              </button>
            </Row>
          </Section>

          {loadStorageUsage && (
            <StorageSection isOpen={isOpen} version={projectsVersion} load={loadStorageUsage} activeProjectId={activeProjectId} onDeleteProject={onDeleteProject} />
          )}

          <Section title="Graph & Physics">
            <Row label="Interactive repulsion physics" description="Nearby nodes repel when you drag an entity">
              <Toggle on={physicsBounce} onClick={handlePhysicsToggle} />
            </Row>
            <Row label="Glow on hover" description="Soft circular highlight around the hovered node">
              <Toggle on={auraGlow} onClick={handleAuraToggle} />
            </Row>
            <Row label="Default graph layout" description="Layout used when a case is opened">
              <div className="flex items-stretch h-[24px] border border-[var(--t-border)] rounded-[3px] overflow-hidden">
                {[
                  { id: 'cose', label: 'Force' },
                  { id: 'concentric', label: 'Radial' },
                  { id: 'breadthfirst', label: 'Tree' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleLayoutChange(l.id)}
                    className={`px-3 text-[11.5px] border-l border-[var(--t-border)] first:border-l-0 ${
                      defaultLayout === l.id ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 hover:bg-[var(--t-hover)]'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          <Section title="Keyboard & Navigation">
            <Row label="Keyboard shortcuts" description="All hotkeys in one sheet">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="t-btn"
              >
                <Keyboard className="w-3.5 h-3.5 opacity-70" />
                View shortcuts
                <span className="t-kbd ml-0.5">?</span>
              </button>
            </Row>
          </Section>

          <Section title="About & Updates">
            <Row label="Trace" description={`Installed version ${__APP_VERSION__}`}>
              <button type="button" onClick={handleCheckForUpdates} className="t-btn" disabled={updateState === 'checking'}>
                {updateState === 'checking' ? (
                  <Loader2 className="w-3.5 h-3.5 opacity-70 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 opacity-70" />
                )}
                {updateState === 'checking' ? 'Checking…' : 'Check for Updates'}
              </button>
            </Row>
            {updateResult && <UpdateResultRow result={updateResult} />}
          </Section>

          <ChangelogSection />

          <Section title="Danger Zone" danger>
            <Row label="Reset local application data" description="Clears local storage and re-seeds the sample project. Cannot be undone.">
              <button
                type="button"
                onClick={handleClearData}
                className={`t-btn ${resetConfirm ? '!bg-rose-500/80 !border-rose-500/80 !text-white' : '!text-rose-400 hover:!border-rose-500/50'}`}
              >
                <Trash2 className="w-3.5 h-3.5 opacity-80" />
                {resetConfirm ? 'Click again to confirm' : 'Reset storage'}
              </button>
            </Row>
          </Section>
        </div>

        {/* Footer */}
        <div className="h-[48px] shrink-0 px-5 border-t border-[var(--t-border)] flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-baseline gap-2 select-text">
            <span className="text-[12px] font-semibold text-zinc-300 shrink-0">Trace</span>
            <span className="text-[10.5px] font-mono text-zinc-500 shrink-0">{__APP_VERSION__}</span>
            {isDesktop && (
              <span className="text-[10.5px] font-mono text-zinc-600 truncate select-text" title={`Build ID (UTC time – commit)\n${__BUILD_ID__}`}>
                build {__BUILD_ID__}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="t-btn t-btn-primary !px-4 shrink-0">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/** How much space TRACE's data takes, with one row per case and a delete action. */
const StorageSection: React.FC<{
  isOpen: boolean;
  version?: ProjectSummary[];
  load: () => Promise<StorageUsage>;
  activeProjectId?: string;
  onDeleteProject?: (id: string) => void;
}> = ({ isOpen, version, load, activeProjectId, onDeleteProject }) => {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    load()
      .then((u) => alive && (setUsage(u), setError('')))
      .catch(() => alive && setError('Could not measure storage.'));
    return () => {
      alive = false;
    };
  }, [isOpen, version, load]);

  const parts: { label: string; bytes: number }[] = usage
    ? [
        { label: 'Investigations', bytes: usage.projectsBytes },
        ...(usage.kind === 'disk'
          ? [
              { label: 'Installed tools', bytes: usage.toolsBytes },
              { label: 'Portable Python', bytes: usage.pythonBytes },
              { label: 'Removed, kept on disk', bytes: usage.removedBytes },
            ]
          : [{ label: 'Settings & other', bytes: Math.max(0, usage.totalBytes - usage.projectsBytes) }]),
      ].filter((p) => p.bytes > 0 || p.label === 'Investigations')
    : [];
  const total = Math.max(1, usage?.totalBytes ?? 1);
  const COLORS = ['bg-[var(--t-accent)]', 'bg-[#739cc0]', 'bg-[#b5a2d4]', 'bg-[#c6a463]'];

  return (
    <Section title="Storage">
      {error && <div className="px-4 py-3 text-[11.5px] text-amber-400">{error}</div>}
      {usage && (
        <>
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-zinc-200">TRACE data</span>
              <span className="font-mono text-[12px] text-zinc-100 tabular-nums">{formatBytes(usage.totalBytes)}</span>
            </div>
            <div className="mt-2 h-[6px] rounded-full bg-[var(--t-bg)] overflow-hidden flex">
              {parts.map((p, i) => (
                <div key={p.label} className={COLORS[i % COLORS.length]} style={{ width: `${(p.bytes / total) * 100}%` }} title={`${p.label}: ${formatBytes(p.bytes)}`} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px]">
              {parts.map((p, i) => (
                <div key={p.label} className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-[2px] shrink-0 ${COLORS[i % COLORS.length]}`} />
                  <span className="text-zinc-400 truncate flex-1">{p.label}</span>
                  <span className="font-mono text-zinc-300 tabular-nums">{formatBytes(p.bytes)}</span>
                </div>
              ))}
            </div>
            {usage.kind === 'browser' && usage.browserQuotaBytes ? (
              <div className="mt-2 text-[11px] text-zinc-500">
                Browser reports {formatBytes(usage.browserUsageBytes ?? 0)} used of about {formatBytes(usage.browserQuotaBytes)} available for this site.
              </div>
            ) : null}
          </div>
          <div className="px-4 py-2 border-t border-[var(--t-border)] text-[10px] uppercase tracking-wider text-zinc-600">Investigations</div>
          {usage.projects.length === 0 && <div className="px-4 pb-3 text-[11.5px] text-zinc-600">No investigations.</div>}
          {usage.projects.map((p) => (
            <div key={p.id} className="px-4 h-[34px] flex items-center gap-3 border-t border-[var(--t-border)] first:border-t-0">
              <span className="flex-1 min-w-0 truncate text-[12px] text-zinc-200" title={p.id}>
                {p.name}
                {p.id === activeProjectId && <span className="ml-2 text-[10px] text-[var(--t-accent)]">open</span>}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{formatBytes(p.bytes)}</span>
              {onDeleteProject && (
                <button type="button" className="t-icon-btn !w-6 !h-6 hover:!text-rose-400" title={`Remove "${p.name}"…`} onClick={() => onDeleteProject(p.id)}>
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
          <div className="px-4 py-2 border-t border-[var(--t-border)] text-[11px] text-zinc-600 font-mono truncate" title={usage.location}>
            {usage.location}
          </div>
        </>
      )}
      {!usage && !error && <div className="px-4 py-3 text-[11.5px] text-zinc-500">Measuring…</div>}
    </Section>
  );
};

/** Release notes of the installed version, straight from its GitHub release (cached for offline use). */
const ChangelogSection: React.FC = () => {
  const { state, reload } = useReleaseNotes(__APP_VERSION__);
  const release = state.status === 'ok' ? state.release : state.status === 'loading' ? state.cached : null;
  return (
    <Section title={`Changelog · ${__APP_VERSION__}`}>
      <div className="px-4 py-3 text-[11.5px]">
        {release ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-zinc-100 font-medium truncate">{release.name}</span>
              {release.prerelease && <span className="t-kbd !text-[10px]">pre-release</span>}
              <span className="text-zinc-500 font-mono text-[10.5px]">{release.publishedAt.slice(0, 10)}</span>
              <div className="flex-1" />
              <a href={release.url} target="_blank" rel="noopener noreferrer" className="t-btn shrink-0">
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                GitHub
              </a>
            </div>
            {release.notes.trim() ? (
              <ReleaseNotes markdown={release.notes} className="max-h-[240px] overflow-y-auto rounded-[3px] border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2" />
            ) : (
              <div className="text-zinc-500">This release has no written notes.</div>
            )}
          </>
        ) : state.status === 'loading' ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading release notes…
          </div>
        ) : state.status === 'not-found' ? (
          <div className="text-zinc-500">
            No release notes are published for {__APP_VERSION__} yet — this is probably a local or unreleased build.{' '}
            <a href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--t-accent)] hover:underline">
              All releases
            </a>
          </div>
        ) : (
          <div>
            <div className="text-amber-400">Could not load the changelog</div>
            <div className="text-zinc-500 mt-0.5">{state.status === 'error' ? state.message : ''}</div>
            <button type="button" className="t-btn mt-2" onClick={reload}>
              <RefreshCw className="w-3.5 h-3.5 opacity-70" />
              Try again
            </button>
          </div>
        )}
      </div>
    </Section>
  );
};

/** Outcome of a "Check for Updates" request. Never downloads anything. */
const UpdateResultRow: React.FC<{ result: UpdateCheckResult }> = ({ result }) => {
  if (result.status === 'error') {
    return (
      <div className="px-4 py-3 text-[11.5px]" role="status">
        <div className="text-amber-400">Could not check for updates</div>
        <div className="text-zinc-500 mt-0.5">{result.message}</div>
        <a href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-[var(--t-accent)] hover:underline">
          Open releases page <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }
  if (result.status === 'up-to-date') {
    return (
      <div className="px-4 py-3 text-[11.5px]" role="status">
        <div className="text-emerald-400">Trace is up to date.</div>
        <div className="text-zinc-500 mt-0.5">
          {result.latest ? `Latest release: ${result.latest.version}` : 'No newer release found.'}
        </div>
      </div>
    );
  }
  const { latest } = result;
  return (
    <div className="px-4 py-3 text-[11.5px]" role="status">
      <div className="flex items-center gap-2">
        <span className="text-zinc-100 font-medium">Update available: {latest.version}</span>
        {latest.prerelease && <span className="t-kbd !text-[10px]">pre-release</span>}
        <span className="text-zinc-500 font-mono text-[10.5px]">{latest.publishedAt.slice(0, 10)}</span>
        <div className="flex-1" />
        <a href={latest.url} target="_blank" rel="noopener noreferrer" className="t-btn t-btn-primary">
          <ExternalLink className="w-3.5 h-3.5" />
          View release
        </a>
      </div>
      {latest.notes && <ReleaseNotes markdown={latest.notes} className="mt-2 max-h-[220px] overflow-y-auto rounded-[3px] border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2" />}
    </div>
  );
};

/** Settings section: label above one bordered group of rows. */
const Section: React.FC<{ title: string; danger?: boolean; children: React.ReactNode }> = ({ title, danger, children }) => (
  <section>
    <h3 className={`t-label mb-2 ${danger ? '!text-rose-400/80' : '!text-zinc-500'}`}>{title}</h3>
    <div
      className={`rounded-[4px] border divide-y ${
        danger ? 'border-rose-500/25 divide-rose-500/15 bg-rose-950/10' : 'border-[var(--t-border)] divide-[var(--t-border)] bg-[var(--t-raised)]/40'
      }`}
    >
      {children}
    </div>
  </section>
);

/** One setting: label + description on the left, control right-aligned (or below when stacked). */
const Row: React.FC<{ label: string; description?: string; stacked?: boolean; children: React.ReactNode }> = ({
  label,
  description,
  stacked,
  children,
}) =>
  stacked ? (
    <div className="px-4 py-3">
      <div className="text-[12px] font-medium text-zinc-200">{label}</div>
      {description && <div className="text-[11px] text-zinc-500 mt-0.5 mb-2">{description}</div>}
      {children}
    </div>
  ) : (
    <div className="px-4 py-3 flex items-center gap-6 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-zinc-200">{label}</div>
        {description && <div className="text-[11px] text-zinc-500 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );

const Toggle: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={onClick}
    className={`w-8 h-[18px] rounded-full p-[2px] flex transition-colors ${on ? 'bg-[var(--t-accent)] justify-end' : 'bg-zinc-700 justify-start'}`}
  >
    <span className="w-[14px] h-[14px] rounded-full bg-white" />
  </button>
);
