import React, { useState, useEffect } from 'react';
import { ProjectData, Source, SOURCE_TYPES, SourceType } from '@/types';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { StatusBadge } from '@/components/common/StatusBadge';
import { isSafeUrl } from '@/utils/url';
import {
  Save,
  Trash2,
  Globe,
  ExternalLink,
  Calendar,
  FileText,
  Link,
  ShieldCheck,
  Bookmark,
} from 'lucide-react';

interface SourceEditorProps {
  source: Source;
  projectData: ProjectData;
  onSave: (source: Source) => void;
  onDelete: (sourceId: string) => void;
  onOpenRelationship: (relId: string) => void;
  onOpenEntity: (entityId: string) => void;
  isQuickPinned?: boolean;
  onToggleQuickPin?: () => void;
}

export const SourceEditor: React.FC<SourceEditorProps> = ({
  source,
  projectData,
  onSave,
  onDelete,
  onOpenRelationship,
  onOpenEntity,
  isQuickPinned,
  onToggleQuickPin,
}) => {
  const [draft, setDraft] = useState<Source>({ ...source });
  const [isDirty, setIsDirty] = useState<boolean>(false);

  useEffect(() => {
    setDraft({ ...source });
    setIsDirty(false);
  }, [source]);

  const updateDraft = (updates: Partial<Source>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(draft);
    setIsDirty(false);
  };

  // Find relationships that cite this source
  const citingRelationships = projectData.relationships.filter((r) =>
    r.evidence.includes(source.id)
  );

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 h-[40px] shrink-0 flex items-center justify-between pl-4 pr-2 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
        <div className="flex items-center space-x-3">
          <div className="hidden">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10.5px] text-zinc-600">{draft.id}</span>
              <span className="text-xs text-emerald-400 font-mono">[{draft.source_type}]</span>
              {isDirty && (
                <span className="text-[10.5px] text-amber-400">
                  Unsaved changes
                </span>
              )}
            </div>
            <h1 className="text-[13.5px] font-semibold text-zinc-50 leading-tight">{draft.title}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onToggleQuickPin && (
            <button
              type="button"
              onClick={onToggleQuickPin}
              className={`px-2.5 py-1.5 flex items-center space-x-1.5 text-xs rounded-md font-medium transition-colors border ${
                isQuickPinned
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-[var(--t-raised)] text-obsidian-dim hover:text-white hover:bg-white/5 border-obsidian-border'
              }`}
              title={isQuickPinned ? 'Remove from Global Quick Access' : 'Pin to Global Quick Access'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isQuickPinned ? 'fill-current text-zinc-200' : ''}`} />
              <span>{isQuickPinned ? 'In Quick Access' : 'Quick Access'}</span>
            </button>
          )}

          {draft.url && isSafeUrl(draft.url) && (
            <a
              href={draft.url}
              target="_blank"
              rel="noopener noreferrer"
              className="t-icon-btn"
              title="Open URL in Browser"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className={`t-btn ${
              isDirty
                ? 't-btn-primary'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Source</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="t-icon-btn hover:!text-rose-400"
            title="Delete Source"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 max-w-[980px] w-full space-y-5">
        {/* Source Metadata Card */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Source Title *
              </label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                className="t-input"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Source Type *
              </label>
              <select
                value={draft.source_type}
                onChange={(e) => updateDraft({ source_type: e.target.value as SourceType })}
                className="t-input"
              >
                {SOURCE_TYPES.map((st) => (
                  <option key={st.type} value={st.type} className="bg-[var(--t-raised)]">
                    {st.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                URL / Archive Link
              </label>
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={draft.url || ''}
                  onChange={(e) => updateDraft({ url: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded text-xs text-obsidian-text focus:outline-none focus:border-[var(--t-accent)]"
                />
                {draft.url && (
                  <a
                    href={draft.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-obsidian-muted hover:text-white bg-[var(--t-panel)] border border-obsidian-border rounded"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Accessed / Archived At
              </label>
              <input
                type="text"
                value={draft.accessed_at}
                onChange={(e) => updateDraft({ accessed_at: e.target.value })}
                className="w-full px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded text-xs text-obsidian-text font-mono focus:outline-none focus:border-[var(--t-accent)]"
              />
            </div>
          </div>
        </div>

        {/* Markdown Extract & Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Source Content & Extract</h2>
            </div>
          </div>
          <MarkdownEditor
            value={draft.markdownBody}
            onChange={(val) => updateDraft({ markdownBody: val })}
            onWikilinkClick={(target) => {
              const ent = projectData.entities.find((e) => e.id === target || e.name === target);
              if (ent) onOpenEntity(ent.id);
            }}
          />
        </div>

        {/* Citations in Investigation */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <h2 className="t-label !text-zinc-400 border-b border-obsidian-border pb-2">
            Cited as Evidence in Relationships ({citingRelationships.length})
          </h2>
          {citingRelationships.length > 0 ? (
            <div className="space-y-2">
              {citingRelationships.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => onOpenRelationship(rel.id)}
                  className="p-2.5 bg-[var(--t-panel)] hover:bg-obsidian-hover border border-obsidian-border rounded cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div className="truncate mr-3">
                    <span className="font-mono text-xs text-purple-300 font-medium">
                      {rel.type}
                    </span>{' '}
                    <span className="text-xs text-obsidian-muted">
                      ({rel.source_entity} → {rel.target_entity})
                    </span>
                  </div>
                  <StatusBadge status={rel.status} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-obsidian-dim italic">
              This source is not cited as evidence by any relationships yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
