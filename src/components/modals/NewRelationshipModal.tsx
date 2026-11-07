import React, { useState, useEffect } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { ProjectData, Relationship, RelationshipStatus, RELATIONSHIP_STATUSES } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { X, Share2, Plus } from 'lucide-react';

interface NewRelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (rel: Relationship) => void;
  projectData: ProjectData;
  defaultSourceId?: string;
  defaultTargetId?: string;
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

export const NewRelationshipModal: React.FC<NewRelationshipModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  projectData,
  defaultSourceId,
  defaultTargetId,
}) => {
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [type, setType] = useState<string>('associated_with');
  const [status, setStatus] = useState<RelationshipStatus>('candidate');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [directed, setDirected] = useState<boolean>(true);

  // Synchronize when modal is opened or defaults change
  useEffect(() => {
    if (isOpen && projectData.entities.length > 0) {
      const src = defaultSourceId && projectData.entities.some((e) => e.id === defaultSourceId)
        ? defaultSourceId
        : projectData.entities[0].id;

      let tgt = defaultTargetId && projectData.entities.some((e) => e.id === defaultTargetId)
        ? defaultTargetId
        : undefined;

      if (!tgt || tgt === src) {
        const other = projectData.entities.find((e) => e.id !== src);
        tgt = other ? other.id : src;
      }

      setSourceId(src);
      setTargetId(tgt);
      setType('associated_with');
      setStatus('candidate');
      setConfidence(null);
      setDirected(true);
    }
  }, [isOpen, defaultSourceId, defaultTargetId, projectData]);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId || !type.trim()) return;

    const now = new Date().toISOString();
    const id = `rel-${Date.now().toString(36)}`;

    const newRel: Relationship = {
      id,
      type: type.trim(),
      source_entity: sourceId,
      target_entity: targetId,
      directed,
      status,
      confidence,
      evidence: [],
      created_at: now,
      markdownBody: `# Relationship: ${type.trim()}\n\n## Explanation\n\nDocument reason for relationship hypothesis.\n\n## Evidence\n\nAdd supporting observations.`,
    };

    onCreate(newRel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
      <div className="bg-[var(--t-panel)] border border-[#2e2f34] rounded-[4px] max-w-lg w-full shadow-popover overflow-hidden text-[12px]">
        {/* Header */}
        <div className="h-[32px] flex items-center justify-between pl-3 pr-1.5 border-b border-[var(--t-border)]">
          <div className="flex items-center space-x-2 font-semibold text-obsidian-text">
            <Share2 className="w-4 h-4 text-purple-400" />
            <span>Create Relationship Claim</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="t-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Source Entity *
              </label>
              <select
                value={sourceId}
                onChange={(e) => {
                  const newSrc = e.target.value;
                  setSourceId(newSrc);
                  if (targetId === newSrc) {
                    const other = projectData.entities.find((ent) => ent.id !== newSrc);
                    if (other) setTargetId(other.id);
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded text-obsidian-text focus:outline-none focus:border-[var(--t-accent)] cursor-pointer"
                required
              >
                {projectData.entities.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[var(--t-raised)]">
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Target Entity *
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded text-obsidian-text focus:outline-none focus:border-[var(--t-accent)] cursor-pointer"
                required
              >
                {projectData.entities.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[var(--t-raised)]">
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Predicate / Relationship Type *
            </label>
            <input
              type="text"
              list="modal-rel-types"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. operates, owns, registered..."
              className="w-full px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded font-mono text-purple-300 focus:outline-none focus:border-[var(--t-accent)]"
              required
            />
            <datalist id="modal-rel-types">
              {COMMON_RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Verification Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RelationshipStatus)}
                className="w-full px-2.5 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded text-obsidian-text focus:outline-none focus:border-[var(--t-accent)] cursor-pointer"
              >
                {RELATIONSHIP_STATUSES.map((s) => (
                  <option key={s.status} value={s.status} className="bg-[var(--t-raised)]">
                    {s.label} ({s.borderStyle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Direction
              </label>
              <label className="flex items-center space-x-2 mt-2 cursor-pointer text-obsidian-text">
                <input
                  type="checkbox"
                  checked={directed}
                  onChange={(e) => setDirected(e.target.checked)}
                  className="rounded bg-[var(--t-panel)] border-obsidian-border text-obsidian-accent focus:ring-0"
                />
                <span>Directed (Source → Target)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-obsidian-border">
            <button
              type="button"
              onClick={onClose}
              className="t-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!sourceId || !targetId || !type.trim()}
              className="t-btn t-btn-primary"
            >
              Create Relationship
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
