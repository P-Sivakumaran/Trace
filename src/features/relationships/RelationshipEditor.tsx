import React, { useState, useEffect } from 'react';
import {
  ProjectData,
  Relationship,
  RelationshipStatus,
  RELATIONSHIP_STATUSES,
  EVIDENCE_CLASSES,
  evidenceClassOf,
} from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { EntityIcon } from '@/components/common/EntityIcon';
import {
  Save,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Percent,
  FileCheck,
  Layers,
  HelpCircle,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

interface RelationshipEditorProps {
  relationship: Relationship;
  projectData: ProjectData;
  onSave: (rel: Relationship) => void;
  onDelete: (relId: string) => void;
  onOpenEntity: (entityId: string) => void;
  onOpenSource: (sourceId: string) => void;
  onShowInGraph: (relId: string) => void;
}

const COMMON_RELATIONSHIP_TYPES = [
  'operates',
  'owns',
  'works_for',
  'resolves_to',
  'registered',
  'associated_with',
  'finances',
  'controls',
  'promotes',
  'director_of',
  'located_at',
  'communicates_with',
  'member_of',
  'mentioned_in',
];

export const RelationshipEditor: React.FC<RelationshipEditorProps> = ({
  relationship,
  projectData,
  onSave,
  onDelete,
  onOpenEntity,
  onOpenSource,
  onShowInGraph,
}) => {
  const [draft, setDraft] = useState<Relationship>({ ...relationship });
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [allowSelfRef, setAllowSelfRef] = useState<boolean>(
    relationship.source_entity === relationship.target_entity
  );

  useEffect(() => {
    setDraft({ ...relationship });
    setIsDirty(false);
  }, [relationship]);

  const updateDraft = (updates: Partial<Relationship>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!draft.source_entity || !draft.target_entity || !draft.type.trim()) return;
    onSave(draft);
    setIsDirty(false);
  };

  const toggleEvidenceSource = (sourceId: string) => {
    const exists = draft.evidence.includes(sourceId);
    const nextEvidence = exists
      ? draft.evidence.filter((id) => id !== sourceId)
      : [...draft.evidence, sourceId];
    updateDraft({ evidence: nextEvidence });
  };

  const getEntity = (id: string) => projectData.entities.find((e) => e.id === id);
  const sourceEntity = getEntity(draft.source_entity);
  const targetEntity = getEntity(draft.target_entity);

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] overflow-y-auto">
      {/* Top Header */}
      <div className="sticky top-0 z-20 h-[40px] shrink-0 flex items-center justify-between pl-4 pr-2 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
        <div className="flex items-center space-x-3">
          <div className="hidden">
            <ArrowRight className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10.5px] text-zinc-600">{draft.id}</span>
              <StatusBadge status={draft.status} size="sm" />
              {isDirty && (
                <span className="text-[10.5px] text-amber-400">
                  Unsaved changes
                </span>
              )}
            </div>
            <h1 className="text-[13.5px] font-semibold text-zinc-50 leading-tight">
              Relationship: <span className="text-purple-400">{draft.type}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onShowInGraph(draft.id)}
            className="t-btn"
          >
            <Layers className="w-3.5 h-3.5 opacity-70" />
            <span>Show in Graph</span>
          </button>

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
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="t-icon-btn hover:!text-rose-400"
            title="Delete Relationship"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="px-6 py-4 max-w-[980px] w-full space-y-5">
        {/* Connection Setup Card */}
        <div className="bg-obsidian-card border border-obsidian-border rounded-lg p-5 space-y-5 shadow-subtle">
          <h2 className="t-label !text-zinc-400 border-b border-obsidian-border pb-2">
            Connected Entities & Predicate
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Source Entity */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-obsidian-muted">
                Source Entity (Subject) *
              </label>
              <select
                value={draft.source_entity}
                onChange={(e) => updateDraft({ source_entity: e.target.value })}
                className="t-input !h-auto py-1.5 cursor-pointer"
              >
                <option value="" disabled>
                  Select source entity...
                </option>
                {projectData.entities.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[var(--t-raised)]">
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
              {sourceEntity && (
                <button
                  type="button"
                  onClick={() => onOpenEntity(sourceEntity.id)}
                  className="flex items-center space-x-1 text-[11px] text-sky-400 hover:underline pt-0.5"
                >
                  <EntityIcon type={sourceEntity.type} className="w-3 h-3" />
                  <span>Inspect {sourceEntity.name}</span>
                </button>
              )}
              {!sourceEntity && draft.source_entity && (
                <div className="flex items-center space-x-1.5 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-900/50 px-2 py-1 rounded">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Missing endpoint: entity "{draft.source_entity}" not found</span>
                </div>
              )}
            </div>

            {/* Relationship Type / Verb */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-obsidian-muted">
                Predicate / Claim Type *
              </label>
              <input
                type="text"
                list="rel-types"
                value={draft.type}
                onChange={(e) => updateDraft({ type: e.target.value })}
                placeholder="e.g. operates, owns..."
                className="w-full px-3 py-2 bg-[var(--t-panel)] border border-obsidian-border rounded text-xs font-mono text-purple-300 focus:outline-none focus:border-[var(--t-accent)]"
              />
              <datalist id="rel-types">
                {COMMON_RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <div className="flex items-center space-x-2 pt-0.5">
                <label className="flex items-center space-x-1.5 text-[11px] text-obsidian-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.directed}
                    onChange={(e) => updateDraft({ directed: e.target.checked })}
                    className="rounded bg-[var(--t-panel)] border-obsidian-border text-obsidian-accent focus:ring-0"
                  />
                  <span>Directed (→)</span>
                </label>
              </div>
            </div>

            {/* Target Entity */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-obsidian-muted">
                Target Entity (Object) *
              </label>
              <select
                value={draft.target_entity}
                onChange={(e) => updateDraft({ target_entity: e.target.value })}
                className="t-input !h-auto py-1.5 cursor-pointer"
              >
                <option value="" disabled>
                  Select target entity...
                </option>
                {projectData.entities
                  .filter((e) => allowSelfRef || e.id !== draft.source_entity)
                  .map((e) => (
                    <option key={e.id} value={e.id} className="bg-[var(--t-raised)]">
                      {e.name} ({e.type})
                    </option>
                  ))}
              </select>
              {targetEntity && (
                <button
                  type="button"
                  onClick={() => onOpenEntity(targetEntity.id)}
                  className="flex items-center space-x-1 text-[11px] text-sky-400 hover:underline pt-0.5"
                >
                  <EntityIcon type={targetEntity.type} className="w-3 h-3" />
                  <span>Inspect {targetEntity.name}</span>
                </button>
              )}
              {!targetEntity && draft.target_entity && (
                <div className="flex items-center space-x-1.5 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-900/50 px-2 py-1 rounded">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Missing endpoint: entity "{draft.target_entity}" not found</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Verification Status & Confidence Score */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <h2 className="t-label !text-zinc-400 border-b border-obsidian-border pb-2">
            Verification Status & Evaluation
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Verification Status */}
            <div>
              <label className="flex items-baseline justify-between text-[11px] text-zinc-500 mb-1">
                <span>Investigative Status *</span>
                <span className="text-zinc-400" title="Evidence class derived from the status">
                  {EVIDENCE_CLASSES.find((c) => c.cls === evidenceClassOf(draft.status))?.label}
                </span>
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {RELATIONSHIP_STATUSES.map((st) => (
                  <label
                    key={st.status}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                      draft.status === st.status
                        ? 'bg-obsidian-hover border-obsidian-accent'
                        : 'bg-[var(--t-panel)] border-obsidian-border hover:bg-obsidian-hover/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="rel_status"
                        checked={draft.status === st.status}
                        onChange={() => updateDraft({ status: st.status })}
                        className="text-obsidian-accent focus:ring-0"
                      />
                      <StatusBadge status={st.status} size="sm" />
                    </div>
                    <span className="text-[11px] text-obsidian-dim">{EVIDENCE_CLASSES.find((c) => c.cls === evidenceClassOf(st.status))?.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Confidence Slider */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-obsidian-muted">
                Confidence Estimate (Optional)
              </label>
              <div className="p-3 bg-[var(--t-panel)] border border-obsidian-border rounded-md space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-obsidian-muted">Confidence:</span>
                  <span className="font-mono font-medium text-obsidian-text">
                    {draft.confidence !== null && draft.confidence !== undefined
                      ? `${draft.confidence}%`
                      : 'None specified'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft.confidence ?? 50}
                  onChange={(e) => updateDraft({ confidence: parseInt(e.target.value, 10) })}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex justify-between items-center text-[10px] text-obsidian-dim">
                  <span>0% (Hypothesis)</span>
                  <button
                    type="button"
                    onClick={() => updateDraft({ confidence: null })}
                    className="text-purple-400 hover:underline"
                  >
                    Clear confidence
                  </button>
                  <span>100% (Absolute proof)</span>
                </div>
              </div>
              <p className="text-[11px] text-obsidian-dim italic">
                * Note: In OSINT investigations, confidence scores are working estimations and never proof in themselves.
              </p>
            </div>
          </div>
        </div>

        {/* Linked Evidence Sources */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Supporting Evidence Sources</h2>
            </div>
          </div>

          <div className="space-y-2">
            {projectData.sources.map((src) => {
              const isChecked = draft.evidence.includes(src.id);
              return (
                <div
                  key={src.id}
                  className={`flex items-center justify-between p-2.5 rounded border transition-colors ${
                    isChecked
                      ? 'bg-purple-950/20 border-purple-800/80'
                      : 'bg-[var(--t-panel)] border-obsidian-border hover:bg-obsidian-hover/50'
                  }`}
                >
                  <label className="flex items-center space-x-2.5 cursor-pointer flex-1 mr-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleEvidenceSource(src.id)}
                      className="rounded bg-[var(--t-panel)] border-obsidian-border text-obsidian-accent focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-medium text-obsidian-text">{src.title}</div>
                      <div className="text-[11px] text-obsidian-dim font-mono">
                        {src.id} • {src.source_type}
                        {src.accessed_at ? ` • captured ${String(src.accessed_at).slice(0, 10)}` : ''}
                        {src.url ? ` • ${src.url}` : ''}
                      </div>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenSource(src.id)}
                    className="p-1 text-obsidian-dim hover:text-white"
                    title="Inspect Source"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {draft.evidence
              .filter((id) => !projectData.sources.some((s) => s.id === id))
              .map((missingId) => (
                <div
                  key={missingId}
                  className="flex items-center justify-between p-2.5 rounded border border-rose-900/60 bg-rose-950/20"
                >
                  <div className="flex items-center space-x-2 text-rose-300 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>Missing source reference: <code className="font-mono text-[11px] bg-rose-950/60 px-1 py-0.5 rounded">{missingId}</code></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleEvidenceSource(missingId)}
                    className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
                  >
                    Remove reference
                  </button>
                </div>
              ))}

            {projectData.sources.length === 0 && (
              <p className="text-xs text-obsidian-dim italic py-2">
                No sources documented in this project yet.
              </p>
            )}
          </div>
        </div>

        {/* Markdown Explanation & Evidence Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Relationship Explanation & Argument</h2>
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
      </div>
    </div>
  );
};
