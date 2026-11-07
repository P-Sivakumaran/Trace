import React from 'react';
import { ProjectData } from '@/types';
import { getEntityTypeColor, getEntityTypeLabel } from '@/components/common/EntityIcon';

interface StatusBarProps {
  projectData?: ProjectData | null;
  selectedEntityId?: string;
  selectedRelationshipId?: string;
  isDesktop: boolean;
  isLoading: boolean;
  message?: string | null;
}

/** Bottom status bar: investigation metrics, current selection, storage. */
export const StatusBar: React.FC<StatusBarProps> = ({
  projectData,
  selectedEntityId,
  selectedRelationshipId,
  isDesktop,
  isLoading,
  message,
}) => {
  const entity = selectedEntityId ? projectData?.entities.find((e) => e.id === selectedEntityId) : undefined;
  const rel = selectedRelationshipId ? projectData?.relationships.find((r) => r.id === selectedRelationshipId) : undefined;
  const unverified = projectData?.relationships.filter((r) => r.status === 'unverified' || r.status === 'candidate').length ?? 0;

  return (
    <footer className="h-[22px] shrink-0 flex items-center bg-[var(--t-panel)] border-t border-[var(--t-border)] text-[11px] text-zinc-500 select-none font-mono tabular-nums">
      {projectData && (
        <>
          <Cell title="Entities">{projectData.entities.length} entities</Cell>
          <Cell title="Relationships">{projectData.relationships.length} links</Cell>
          {unverified > 0 && (
            <Cell title="Unverified or candidate relationships">
              <span className="text-amber-400/80">{unverified} unverified</span>
            </Cell>
          )}
          <Cell title="Sources">{projectData.sources.length} sources</Cell>
          <Cell title="Notes">{projectData.notes.length} notes</Cell>
        </>
      )}
      <div className="flex-1 min-w-0 px-2.5 truncate font-sans text-zinc-400">{message}</div>
      {entity && (
        <Cell title="Selected entity">
          <span className="t-swatch" style={{ background: getEntityTypeColor(entity.type) }} />
          <span className="font-sans text-zinc-300 truncate max-w-[220px]">{entity.name}</span>
          <span>{getEntityTypeLabel(entity.type).toLowerCase()}</span>
        </Cell>
      )}
      {rel && (
        <Cell title="Selected relationship">
          <span className="font-sans text-zinc-300">{rel.type}</span>
          <span>{rel.status}</span>
        </Cell>
      )}
      <Cell title="Storage backend">{isDesktop ? 'disk' : 'browser storage'}</Cell>
      <Cell>v{__APP_VERSION__}</Cell>
    </footer>
  );
};

const Cell: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
  <div title={title} className="h-full flex items-center gap-1.5 px-2.5 border-r border-[var(--t-border-subtle)] last:border-r-0 last:border-l whitespace-nowrap">
    {children}
  </div>
);
