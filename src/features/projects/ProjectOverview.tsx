import React, { useMemo, useState } from 'react';
import { Project, ProjectData, RELATIONSHIP_STATUSES, ENTITY_TYPES } from '@/types';
import { getEntityTypeColor } from '@/components/common/EntityIcon';
import { StatusGlyph } from '@/components/common/StatusBadge';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { Network, Download, RefreshCw, Plus, Save, FolderOpen, Link2 } from 'lucide-react';

interface ProjectOverviewProps {
  projectData: ProjectData;
  onSaveProject: (project: Project) => void;
  onOpenGraph: () => void;
  onCreateEntity: () => void;
  onCreateRelationship: () => void;
  onExportZip: () => void;
  onRebuildIndex: () => void;
  onOpenEntity: (entityId: string) => void;
  onOpenInExplorer?: () => void;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace('T', ' ');
}

const TableHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div className="h-[26px] flex items-center justify-between px-3 border-b border-[var(--t-border-subtle)]">
    <span className="t-label">{title}</span>
    {right}
  </div>
);

/**
 * Case brief: the investigation's working document on the left, case facts
 * and composition on the right. No dashboard cards.
 */
export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  projectData,
  onSaveProject,
  onOpenGraph,
  onCreateEntity,
  onCreateRelationship,
  onExportZip,
  onRebuildIndex,
  onOpenEntity,
  onOpenInExplorer,
}) => {
  const [draft, setDraft] = useState<Project>({ ...projectData.project });
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const updateDraft = (updates: Partial<Project>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSaveProject(draft);
    setIsDirty(false);
  };

  const total = projectData.entities.length;
  const relTotal = projectData.relationships.length;

  const entityTypeCounts = ENTITY_TYPES.map((t) => ({
    ...t,
    count: projectData.entities.filter((e) => e.type === t.type).length,
  })).filter((t) => t.count > 0);

  const statusCounts = RELATIONSHIP_STATUSES.map((s) => ({
    ...s,
    count: projectData.relationships.filter((r) => r.status === s.status).length,
  }));

  const topEntities = useMemo(() => {
    const deg = new Map<string, number>();
    projectData.relationships.forEach((r) => {
      deg.set(r.source_entity, (deg.get(r.source_entity) || 0) + 1);
      deg.set(r.target_entity, (deg.get(r.target_entity) || 0) + 1);
    });
    return projectData.entities
      .map((e) => ({ e, d: deg.get(e.id) || 0 }))
      .filter((x) => x.d > 0)
      .sort((a, b) => b.d - a.d)
      .slice(0, 12);
  }, [projectData.entities, projectData.relationships]);

  const unsourced = projectData.relationships.filter((r) => !r.evidence || r.evidence.length === 0).length;

  return (
    <div
      className="h-full flex flex-col bg-[var(--t-bg)]"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          if (isDirty) handleSave();
        }
      }}
    >
      {/* Toolbar */}
      <div className="h-[32px] shrink-0 flex items-center gap-1 px-2 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <span className="t-label mr-1">Case brief</span>
        <span className="font-mono text-[10.5px] text-zinc-600 truncate">{draft.id}</span>
        <div className="flex-1" />
        <button type="button" onClick={onOpenGraph} className="t-btn">
          <Network className="w-3 h-3" />
          Graph
        </button>
        <button type="button" onClick={onCreateEntity} className="t-btn">
          <Plus className="w-3 h-3" />
          Entity
        </button>
        <button type="button" onClick={onCreateRelationship} className="t-btn">
          <Link2 className="w-3 h-3" />
          Relationship
        </button>
        <div className="w-px h-4 bg-[var(--t-border)] mx-1" />
        {onOpenInExplorer && (
          <button type="button" onClick={onOpenInExplorer} className="t-icon-btn" title="Reveal case folder">
            <FolderOpen />
          </button>
        )}
        <button type="button" onClick={onExportZip} className="t-icon-btn" title="Export case archive (.zip)">
          <Download />
        </button>
        <button type="button" onClick={onRebuildIndex} className="t-icon-btn" title="Rebuild full-text index">
          <RefreshCw />
        </button>
        <div className="w-px h-4 bg-[var(--t-border)] mx-1" />
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
          className={`t-btn ${isDirty ? 't-btn-primary' : ''}`}
          title="Save project.md  (⌘S)"
        >
          <Save className="w-3 h-3" />
          {isDirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Working document */}
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          <div className="px-6 pt-4 pb-2 max-w-[920px] w-full">
            <input
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              className="w-full bg-transparent text-[17px] font-semibold text-zinc-50 outline-none border-b border-transparent focus:border-[var(--t-border)] pb-0.5"
              aria-label="Investigation name"
            />
            <div className="mt-1 text-[11px] text-zinc-500 font-mono">
              project.md · created {fmt(draft.created_at)} · updated {fmt(draft.updated_at)}
            </div>
          </div>
          <div className="px-6 pb-6 max-w-[920px] w-full flex-1">
            <MarkdownEditor
              value={draft.markdownBody}
              onChange={(val) => updateDraft({ markdownBody: val })}
              placeholder="Objective, scope, leads, open questions…"
              minHeight="420px"
              onWikilinkClick={(target) => {
                const ent = projectData.entities.find((e) => e.id === target || e.name === target);
                if (ent) onOpenEntity(ent.id);
              }}
            />
          </div>
        </div>

        {/* Case facts */}
        <aside className="w-[300px] max-[1300px]:w-[260px] shrink-0 border-l border-[var(--t-border)] bg-[var(--t-panel)] overflow-y-auto text-[12px]">
          <TableHead title="Case" />
          <dl className="t-kv px-3 py-1.5">
            <dt>Entities</dt>
            <dd className="font-mono tabular-nums">{total}</dd>
            <dt>Relationships</dt>
            <dd className="font-mono tabular-nums">{relTotal}</dd>
            <dt>Sources</dt>
            <dd className="font-mono tabular-nums">{projectData.sources.length}</dd>
            <dt>Notes</dt>
            <dd className="font-mono tabular-nums">{projectData.notes.length}</dd>
            <dt>Unsourced links</dt>
            <dd className={`font-mono tabular-nums ${unsourced > 0 ? 'text-amber-400' : ''}`}>{unsourced}</dd>
          </dl>

          <TableHead title="Composition" />
          <div className="py-1">
            {entityTypeCounts.length === 0 && <div className="px-3 py-1 text-zinc-600">No entities.</div>}
            {entityTypeCounts.map((t) => (
              <div key={t.type} className="flex items-center gap-2 px-3 h-[20px]">
                <span className="t-swatch" style={{ background: t.color }} />
                <span className="flex-1 truncate text-zinc-300">{t.label}</span>
                <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums w-10 text-right">
                  {total ? Math.round((t.count / total) * 100) : 0}%
                </span>
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums w-8 text-right">{t.count}</span>
              </div>
            ))}
          </div>

          <TableHead title="Verification" />
          <div className="py-1">
            {statusCounts.map((s) => (
              <div key={s.status} className="flex items-center gap-2 px-3 h-[20px]">
                <StatusGlyph status={s.status} width={16} />
                <span className="flex-1 text-zinc-300">{s.label}</span>
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums w-8 text-right">{s.count}</span>
              </div>
            ))}
          </div>

          <TableHead title="Most connected" />
          <div className="py-0.5">
            {topEntities.length === 0 && <div className="px-3 py-1 text-zinc-600">No relationships yet.</div>}
            {topEntities.map(({ e, d }) => (
              <div key={e.id} className="t-row !pl-3" onClick={() => onOpenEntity(e.id)} title={e.name}>
                <span className="t-swatch !w-[7px] !h-[7px]" style={{ background: getEntityTypeColor(e.type) }} />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">{d}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
