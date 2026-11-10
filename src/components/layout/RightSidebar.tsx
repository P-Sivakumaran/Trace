import React, { useMemo, useState } from 'react';
import { Entity, ENTITY_TYPES, ProjectData, RELATIONSHIP_STATUSES } from '@/types';
import { getEntityTypeColor, getEntityTypeLabel } from '@/components/common/EntityIcon';
import { StatusBadge, StatusGlyph } from '@/components/common/StatusBadge';
import { getTransformsForEntity } from '@/services/transforms/registry';
import { ChevronRight, ExternalLink, Link2, Loader2, Play, Plus } from 'lucide-react';

interface RightSidebarProps {
  isOpen: boolean;
  projectData: ProjectData;
  selectedEntityId?: string;
  selectedRelationshipId?: string;
  onOpenEntity: (entityId: string) => void;
  onOpenRelationship: (relId: string) => void;
  onOpenSource: (sourceId: string) => void;
  onOpenNote?: (noteId: string) => void;
  onCreateRelationship: (sourceId: string) => void;
  /** Creates a note mentioning the entity and opens it. */
  onAddNoteForEntity?: (entityId: string) => void;
  /** Cites a source on a relationship; sourceId null = create a new source. */
  onAddEvidence?: (relationshipId: string, sourceId: string | null) => void;
  onRunTransform?: (entity: Entity, transformId: string) => void;
  activeRunningTransformId?: string;
  width?: number;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
}

const COLLAPSE_KEY = 'trace.inspector.collapsed';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Collapsible inspector section: a thin label row, then content. No card. */
const Section: React.FC<{
  id: string;
  title: string;
  count?: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, count, collapsed, onToggle, right, children }) => {
  const isCollapsed = collapsed.has(id);
  return (
    <section className="border-t border-[var(--t-border)]">
      <div className="h-[26px] flex items-center pr-2">
        <button
          type="button"
          onClick={() => onToggle(id)}
          className="flex-1 h-full flex items-center gap-1 pl-1.5 text-left text-zinc-500 hover:text-zinc-300"
        >
          <ChevronRight className={`w-3 h-3 shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} />
          <span className="t-label !text-inherit">{title}</span>
          {count !== undefined && <span className="font-mono text-[10px] text-zinc-600 tabular-nums ml-1">{count}</span>}
        </button>
        {right}
      </div>
      {!isCollapsed && <div className="pb-2">{children}</div>}
    </section>
  );
};

/** "+" button in a section header that opens a small menu (fixed-positioned so the scroll area never clips it). */
const AddMenu: React.FC<{ title: string; children: (close: () => void) => React.ReactNode }> = ({ title, children }) => {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const close = () => setPos(null);
  return (
    <>
      <button
        type="button"
        className="t-icon-btn !w-5 !h-5"
        title={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <Plus />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[79]" onMouseDown={close} />
          <div className="t-menu fixed z-[80] w-[260px] max-h-[280px] overflow-y-auto" style={{ top: pos.top, right: pos.right }}>
            {children(close)}
          </div>
        </>
      )}
    </>
  );
};

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-1 text-[11.5px] text-zinc-600">{children}</div>
);

export const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  projectData,
  selectedEntityId,
  selectedRelationshipId,
  onOpenEntity,
  onOpenRelationship,
  onOpenSource,
  onOpenNote,
  onCreateRelationship,
  onAddNoteForEntity,
  onAddEvidence,
  onRunTransform,
  activeRunningTransformId,
  width = 320,
  onResize,
  onResetWidth,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '["transforms"]'));
    } catch {
      return new Set(['transforms']);
    }
  });
  const toggleSection = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const entityById = useMemo(() => {
    const m = new Map<string, Entity>();
    projectData.entities.forEach((e) => m.set(e.id, e));
    return m;
  }, [projectData.entities]);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMouseMove = (moveEvent: MouseEvent) => onResize?.(startWidth + (startX - moveEvent.clientX));
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (!isOpen) return null;

  const selectedEntity = selectedEntityId ? entityById.get(selectedEntityId) : undefined;
  const selectedRel = selectedRelationshipId
    ? projectData.relationships.find((r) => r.id === selectedRelationshipId)
    : undefined;

  const EntityLink: React.FC<{ id: string }> = ({ id }) => {
    const ent = entityById.get(id);
    if (!ent) return <span className="text-rose-400">{id} (missing)</span>;
    return (
      <button
        type="button"
        onClick={() => onOpenEntity(id)}
        className="inline-flex items-center gap-1.5 max-w-full text-zinc-200 hover:text-white hover:underline underline-offset-2"
        title={`Open ${ent.name}`}
      >
        <span className="t-swatch !w-[7px] !h-[7px]" style={{ background: getEntityTypeColor(ent.type) }} />
        <span className="truncate">{ent.name}</span>
      </button>
    );
  };

  const SourceRows: React.FC<{ ids: string[] }> = ({ ids }) => (
    <>
      {ids.map((srcId) => {
        const src = projectData.sources.find((s) => s.id === srcId);
        return (
          <div
            key={srcId}
            onClick={() => src && onOpenSource(srcId)}
            className="t-row !h-auto !py-[3px] !items-start"
            title={src?.url || srcId}
          >
            <div className="min-w-0 flex-1">
              <div className={`truncate ${src ? '' : 'text-rose-400'}`}>{src ? src.title : `${srcId} (missing)`}</div>
              {src?.url && <div className="truncate font-mono text-[10px] text-zinc-600">{src.url}</div>}
            </div>
            <span className="font-mono text-[10px] text-zinc-600 shrink-0 pt-px">{src?.source_type}</span>
          </div>
        );
      })}
    </>
  );

  let body: React.ReactNode;

  if (selectedEntity) {
    const rels = projectData.relationships.filter(
      (r) => r.source_entity === selectedEntity.id || r.target_entity === selectedEntity.id
    );
    const inbound = rels.filter((r) => r.target_entity === selectedEntity.id).length;
    const evidenceIds = [...new Set(rels.flatMap((r) => r.evidence || []))];
    const nameLower = selectedEntity.name.toLowerCase();
    const notes = projectData.notes.filter((n) => {
      const body = (n.markdownBody || '').toLowerCase();
      return body.includes(`[[${nameLower}]]`) || body.includes(`[[${selectedEntity.id.toLowerCase()}]]`);
    });
    const transforms = getTransformsForEntity(selectedEntity.type);
    const attrs = Object.entries(selectedEntity.attributes || {}).filter(
      ([, v]) => v !== null && v !== undefined && v !== ''
    );

    body = (
      <>
        {/* Identity */}
        <div className="px-3 pt-2.5 pb-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="t-swatch" style={{ background: getEntityTypeColor(selectedEntity.type) }} />
            <span className="t-label" style={{ color: getEntityTypeColor(selectedEntity.type) }}>
              {selectedEntity.custom_type || getEntityTypeLabel(selectedEntity.type)}
            </span>
          </div>
          <h2 className="text-[14px] font-semibold text-zinc-50 leading-snug break-words select-text">
            {selectedEntity.name}
          </h2>
          {selectedEntity.aliases.length > 0 && (
            <div className="text-[11.5px] text-zinc-500 leading-snug select-text">
              aka {selectedEntity.aliases.join(' · ')}
            </div>
          )}
          <div className="flex items-center gap-1 pt-1">
            <button type="button" className="t-btn" onClick={() => onOpenEntity(selectedEntity.id)}>
              <ExternalLink className="w-3 h-3" />
              Open
            </button>
            <button type="button" className="t-btn" onClick={() => onCreateRelationship(selectedEntity.id)}>
              <Link2 className="w-3 h-3" />
              Link…
            </button>
          </div>
        </div>

        <Section id="props" title="Properties" collapsed={collapsed} onToggle={toggleSection}>
          <dl className="t-kv px-3">
            <dt>ID</dt>
            <dd className="font-mono text-[11px]">{selectedEntity.id}</dd>
            <dt>Connections</dt>
            <dd className="font-mono text-[11px] tabular-nums">
              {rels.length} <span className="text-zinc-600">({inbound} in · {rels.length - inbound} out)</span>
            </dd>
            {attrs.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt title={k}>{k}</dt>
                <dd title={String(typeof v === 'object' ? JSON.stringify(v) : v)}>
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </dd>
              </React.Fragment>
            ))}
            {selectedEntity.tags.length > 0 && (
              <>
                <dt>Tags</dt>
                <dd className="!whitespace-normal">
                  {selectedEntity.tags.map((t) => (
                    <span key={t} className="font-mono text-[11px] text-zinc-400 mr-1.5">
                      #{t}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt>Created</dt>
            <dd className="font-mono text-[11px] text-zinc-400">{fmtDate(selectedEntity.created_at)}</dd>
            <dt>Updated</dt>
            <dd className="font-mono text-[11px] text-zinc-400">{fmtDate(selectedEntity.updated_at)}</dd>
          </dl>
        </Section>

        <Section
          id="rels"
          title="Relationships"
          count={rels.length}
          collapsed={collapsed}
          onToggle={toggleSection}
          right={
            <button
              type="button"
              className="t-icon-btn !w-5 !h-5"
              title="New relationship from this entity"
              onClick={() => onCreateRelationship(selectedEntity.id)}
            >
              <Link2 />
            </button>
          }
        >
          {rels.length === 0 && <Muted>No relationships.</Muted>}
          {rels.map((rel) => {
            const outgoing = rel.source_entity === selectedEntity.id;
            const otherId = outgoing ? rel.target_entity : rel.source_entity;
            const other = entityById.get(otherId);
            return (
              <div
                key={rel.id}
                onClick={() => onOpenRelationship(rel.id)}
                className="t-row !pl-3 gap-1.5"
                title={`${outgoing ? 'outgoing' : 'incoming'} · ${rel.type} · ${rel.status}`}
              >
                <span className="font-mono text-[10px] text-zinc-600 w-2.5 shrink-0">{outgoing ? '→' : '←'}</span>
                {other && <span className="t-swatch !w-[7px] !h-[7px]" style={{ background: getEntityTypeColor(other.type) }} />}
                <span className={`truncate flex-1 ${other ? 'text-zinc-200' : 'text-rose-400'}`}>
                  {other ? other.name : `${otherId} (missing)`}
                </span>
                <span className="font-mono text-[10.5px] text-zinc-500 truncate max-w-[40%]">{rel.type}</span>
                <StatusBadge status={rel.status} size="sm" compact />
              </div>
            );
          })}
        </Section>

        <Section
          id="evidence"
          title="Evidence"
          count={evidenceIds.length}
          collapsed={collapsed}
          onToggle={toggleSection}
          right={
            onAddEvidence && (
              <AddMenu title="Add a source to one of this entity’s relationships">
                {(close) => (
                  <>
                    <div className="px-2.5 py-1 t-label">Cite a new source on…</div>
                    {rels.length === 0 && (
                      <button
                        type="button"
                        className="t-menu-item"
                        onClick={() => {
                          close();
                          onCreateRelationship(selectedEntity.id);
                        }}
                      >
                        <Link2 />
                        <span>No relationships yet — link this entity…</span>
                      </button>
                    )}
                    {rels.map((r) => {
                      const outgoing = r.source_entity === selectedEntity.id;
                      const other = projectData.entities.find((e) => e.id === (outgoing ? r.target_entity : r.source_entity));
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className="t-menu-item"
                          onClick={() => {
                            close();
                            onAddEvidence(r.id, null);
                          }}
                        >
                          <span className="font-mono text-zinc-600 w-3 shrink-0">{outgoing ? '→' : '←'}</span>
                          <span className="truncate flex-1">{other?.name || (outgoing ? r.target_entity : r.source_entity)}</span>
                          <span className="font-mono text-[10px] text-zinc-500 shrink-0 max-w-[80px] truncate">{r.type}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </AddMenu>
            )
          }
        >
          {evidenceIds.length === 0 ? <Muted>No sources cited on this entity’s relationships.</Muted> : <SourceRows ids={evidenceIds} />}
        </Section>

        <Section
          id="notes"
          title="Notes"
          count={notes.length}
          collapsed={collapsed}
          onToggle={toggleSection}
          right={
            onAddNoteForEntity && (
              <button type="button" className="t-icon-btn !w-5 !h-5" title="New note about this entity" onClick={() => onAddNoteForEntity(selectedEntity.id)}>
                <Plus />
              </button>
            )
          }
        >
          {notes.length === 0 ? (
            <Muted>
              No notes mention <span className="font-mono">[[{selectedEntity.name}]]</span>.
            </Muted>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="t-row !pl-3" title={n.title} onClick={() => onOpenNote?.(n.id)}>
                <span className="truncate flex-1">{n.title}</span>
                <span className="font-mono text-[10px] text-zinc-600">{(n.updated_at || '').slice(0, 10)}</span>
              </div>
            ))
          )}
        </Section>

        {transforms.length > 0 && (
          <Section id="transforms" title="Transforms" count={transforms.length} collapsed={collapsed} onToggle={toggleSection}>
            {transforms.map((t) => {
              const running = activeRunningTransformId === t.id;
              return (
                <div key={t.id} className="group flex items-start gap-2 px-3 py-[5px] hover:bg-[var(--t-hover)]" title={t.description}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-zinc-200">{t.name}</span>
                      {t.isMachine && <span className="font-mono text-[9.5px] text-zinc-500 shrink-0">MACHINE</span>}
                    </div>
                    <div className="text-[11px] text-zinc-500 line-clamp-1">{t.description}</div>
                  </div>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => onRunTransform?.(selectedEntity, t.id)}
                    className={`t-btn !h-[22px] !px-1.5 shrink-0 ${running ? '' : 'opacity-60 group-hover:opacity-100'}`}
                    title={`Run ${t.name}`}
                  >
                    {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {running ? 'Running' : 'Run'}
                  </button>
                </div>
              );
            })}
          </Section>
        )}
      </>
    );
  } else if (selectedRel) {
    body = (
      <>
        <div className="px-3 pt-2.5 pb-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="t-label">Relationship</span>
            <StatusBadge status={selectedRel.status} size="sm" />
          </div>
          <h2 className="text-[14px] font-semibold text-zinc-50 font-mono break-words select-text">{selectedRel.type}</h2>
          <div className="text-[12px] leading-relaxed space-y-0.5">
            <EntityLink id={selectedRel.source_entity} />
            <div className="font-mono text-[10px] text-zinc-600 pl-[2px]">{selectedRel.directed ? '↓' : '↕'}</div>
            <EntityLink id={selectedRel.target_entity} />
          </div>
          <div className="pt-1">
            <button type="button" className="t-btn" onClick={() => onOpenRelationship(selectedRel.id)}>
              <ExternalLink className="w-3 h-3" />
              Open
            </button>
          </div>
        </div>

        <Section id="rel-props" title="Properties" collapsed={collapsed} onToggle={toggleSection}>
          <dl className="t-kv px-3">
            <dt>ID</dt>
            <dd className="font-mono text-[11px]">{selectedRel.id}</dd>
            <dt>Status</dt>
            <dd>{RELATIONSHIP_STATUSES.find((s) => s.status === selectedRel.status)?.label}</dd>
            <dt>Confidence</dt>
            <dd className="font-mono text-[11px] tabular-nums">
              {selectedRel.confidence != null ? `${selectedRel.confidence}%` : '—'}
            </dd>
            <dt>Direction</dt>
            <dd>{selectedRel.directed ? 'Directed' : 'Undirected'}</dd>
            <dt>Created</dt>
            <dd className="font-mono text-[11px] text-zinc-400">{fmtDate(selectedRel.created_at)}</dd>
          </dl>
        </Section>

        <Section
          id="rel-evidence"
          title="Evidence"
          count={selectedRel.evidence.length}
          collapsed={collapsed}
          onToggle={toggleSection}
          right={
            onAddEvidence && (
              <AddMenu title="Cite a source on this relationship">
                {(close) => {
                  const uncited = projectData.sources.filter((src) => !selectedRel.evidence.includes(src.id));
                  return (
                    <>
                      <button
                        type="button"
                        className="t-menu-item"
                        onClick={() => {
                          close();
                          onAddEvidence(selectedRel.id, null);
                        }}
                      >
                        <Plus />
                        <span>New source…</span>
                      </button>
                      {uncited.length > 0 && <div className="t-menu-sep" />}
                      {uncited.length > 0 && <div className="px-2.5 py-1 t-label">Cite existing</div>}
                      {uncited.slice(0, 20).map((src) => (
                        <button
                          key={src.id}
                          type="button"
                          className="t-menu-item"
                          onClick={() => {
                            close();
                            onAddEvidence(selectedRel.id, src.id);
                          }}
                        >
                          <span className="truncate flex-1">{src.title}</span>
                          <span className="font-mono text-[10px] text-zinc-500 shrink-0">{src.source_type}</span>
                        </button>
                      ))}
                    </>
                  );
                }}
              </AddMenu>
            )
          }
        >
          {selectedRel.evidence.length === 0 ? (
            <Muted>No supporting sources. Unsourced claims should stay unverified.</Muted>
          ) : (
            <SourceRows ids={selectedRel.evidence} />
          )}
        </Section>

        {selectedRel.markdownBody?.trim() && (
          <Section id="rel-notes" title="Description" collapsed={collapsed} onToggle={toggleSection}>
            <p className="px-3 text-[12px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-text line-clamp-[12]">
              {selectedRel.markdownBody.trim()}
            </p>
          </Section>
        )}
      </>
    );
  } else {
    // Nothing selected: case composition + legend, i.e. information, not a placeholder.
    const counts = ENTITY_TYPES.map((t) => ({
      ...t,
      n: projectData.entities.filter((e) => e.type === t.type).length,
    })).filter((t) => t.n > 0);
    const statusCounts = RELATIONSHIP_STATUSES.map((s) => ({
      ...s,
      n: projectData.relationships.filter((r) => r.status === s.status).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.n));
    body = (
      <>
        <div className="px-3 py-2.5 text-[11.5px] text-zinc-500 leading-relaxed">
          Select an entity or relationship to inspect it.
        </div>
        <Section id="case-entities" title="Entities by type" count={projectData.entities.length} collapsed={collapsed} onToggle={toggleSection}>
          {counts.length === 0 && <Muted>No entities.</Muted>}
          {counts.map((c) => (
            <div key={c.type} className="flex items-center gap-2 px-3 h-[20px] text-[11.5px]">
              <span className="t-swatch" style={{ background: c.color }} />
              <span className="w-24 truncate text-zinc-300">{c.label}</span>
              <div className="flex-1 h-[3px] bg-[var(--t-border-subtle)]">
                <div className="h-full" style={{ width: `${(c.n / max) * 100}%`, background: c.color, opacity: 0.55 }} />
              </div>
              <span className="w-8 text-right font-mono text-[10.5px] text-zinc-500 tabular-nums">{c.n}</span>
            </div>
          ))}
        </Section>
        <Section id="case-status" title="Relationship verification" count={projectData.relationships.length} collapsed={collapsed} onToggle={toggleSection}>
          {statusCounts.map((s) => (
            <div key={s.status} className="flex items-center gap-2 px-3 h-[20px] text-[11.5px]">
              <StatusGlyph status={s.status} width={16} />
              <span className="flex-1 text-zinc-300">{s.label}</span>
              <span className="font-mono text-[10px] text-zinc-600">{s.borderStyle}</span>
              <span className="w-8 text-right font-mono text-[10.5px] text-zinc-500 tabular-nums">{s.n}</span>
            </div>
          ))}
        </Section>
      </>
    );
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-[var(--t-panel)] border-l border-[var(--t-border)] flex flex-col h-full overflow-hidden select-none text-[12px] relative shrink-0"
    >
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={onResetWidth}
        className="absolute top-0 -left-px w-[5px] h-full cursor-col-resize z-40 hover:bg-[var(--t-accent)]/40 active:bg-[var(--t-accent)]/60"
        title="Drag to resize · double-click to reset"
      />
      <div className="t-panel-head justify-between">
        <span className="t-label">
          {selectedEntity ? 'Entity' : selectedRel ? 'Relationship' : 'Case'}
          {selectedEntity || selectedRel ? '' : ' summary'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
};
