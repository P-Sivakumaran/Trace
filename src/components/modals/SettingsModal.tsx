import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  Download,
  RefreshCw,
  Trash2,
  Keyboard,
} from 'lucide-react';
import { Workspace } from '@/types';

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
            {__BUILD_HASH__ && (
              <span className="text-[10.5px] font-mono text-zinc-600 truncate" title={__BUILD_HASH__}>
                sha256 {__BUILD_HASH__}
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
