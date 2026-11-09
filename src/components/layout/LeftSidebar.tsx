import React, { useState, useEffect, useMemo } from 'react';
import {
  Entity,
  EntityType,
  ENTITY_TYPES,
  ProjectData,
  ProjectSummary,
  QuickSource,
  TabType,
  Workspace,
} from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ApiQuickSourceModal } from '@/components/modals/ApiQuickSourceModal';
import { isSafeUrl } from '@/utils/url';
import {
  ChevronRight,
  ChevronDown,
  FolderKanban,
  Network,
  LayoutDashboard,
  Search,
  Plus,
  Share2,
  Trash2,
  Download,
  Upload,
  FileInput,
  Blocks,
  RefreshCw,
  ExternalLink,
  Copy,
  Hash,
  Pin,
  Check,
  FolderOpen,
  Settings,
  Keyboard,
  Users,
  Link2,
  StickyNote,
  FileText,
  Bookmark,
  Globe,
  Zap,
  X,
  Play,
  Code,
  ScanSearch,
  Filter,
  ArrowDownAZ,
  ArrowDownWideNarrow,
} from 'lucide-react';

interface LeftSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  workspace: Workspace;
  projects: ProjectSummary[];
  activeProjectId?: string;
  projectData?: ProjectData | null;
  onSelectProject: (projectId: string) => void;
  onCreateProjectModal: () => void;
  onDeleteProject: (projectId: string) => void;
  activeTabType?: TabType;
  activeTargetId?: string;
  onOpenTab: (type: TabType, targetId?: string, title?: string, options?: { isPreview?: boolean; isPinned?: boolean }) => void;
  onCreateEntityModal: (defaultType?: EntityType) => void;
  onCreateRelationshipModal: (sourceEntityId?: string) => void;
  onCreateSourceModal: () => void;
  onCreateNoteModal: () => void;
  onExportZip: () => void;
  onImportZip: () => void;
  onImportData?: () => void;
  onRebuildIndex: () => void;
  onDeleteEntity?: (id: string) => void;
  onDeleteRelationship?: (id: string) => void;
  onDeleteSource?: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  quickSources?: QuickSource[];
  onAddQuickSource?: (qs: Omit<QuickSource, 'id' | 'created_at'>) => void;
  onRemoveQuickSource?: (id: string) => void;
  onTogglePinQuickSource?: (sourceId: string) => void;
  isSourceQuickPinned?: (sourceId: string) => boolean;
  entities?: Entity[];
  onAttachSourceToEntity?: (entityId: string, title: string, url: string, content: string) => Promise<void> | void;
  onAddEntityAttribute?: (entityId: string, key: string, value: any) => Promise<void> | void;
  onCreateNoteOnEntity?: (entityId: string, title: string, content: string) => Promise<void> | void;
  onUpdateQuickSource?: (qs: QuickSource) => void;
  onOpenRelationshipDiscovery?: () => void;
  isDesktop?: boolean;
  onOpenInExplorer?: (projectId?: string) => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  width?: number;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
}

type ExplorerView = 'entities' | 'links' | 'sources' | 'notes' | 'tools';

const RailButton: React.FC<{ active?: boolean; title: string; onClick?: () => void; children: React.ReactNode }> = ({
  active,
  title,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`relative w-[30px] h-[28px] flex items-center justify-center rounded-[3px] [&>svg]:w-[15px] [&>svg]:h-[15px] ${
      active
        ? 'text-zinc-100 before:absolute before:-left-[4px] before:top-1 before:bottom-1 before:w-[2px] before:bg-[var(--t-accent)]'
        : 'text-zinc-500 hover:text-zinc-200 hover:bg-[var(--t-hover)]'
    }`}
  >
    {children}
  </button>
);

interface SidebarContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  itemType: 'entity' | 'relationship' | 'source' | 'note';
  itemId: string;
  itemTitle: string;
  extra?: any;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isOpen,
  onToggle,
  projects,
  activeProjectId,
  projectData,
  onSelectProject,
  onCreateProjectModal,
  onDeleteProject,
  activeTabType,
  activeTargetId,
  onOpenTab,
  onCreateEntityModal,
  onCreateRelationshipModal,
  onCreateSourceModal,
  onCreateNoteModal,
  onExportZip,
  onImportZip,
  onImportData,
  onRebuildIndex,
  onDeleteEntity,
  onDeleteRelationship,
  onDeleteSource,
  onDeleteNote,
  quickSources = [],
  onAddQuickSource,
  onRemoveQuickSource,
  onTogglePinQuickSource,
  isSourceQuickPinned,
  entities,
  onAttachSourceToEntity,
  onAddEntityAttribute,
  onCreateNoteOnEntity,
  onUpdateQuickSource,
  onOpenRelationshipDiscovery,
  isDesktop,
  onOpenInExplorer,
  onOpenSettings,
  onOpenShortcuts,
  width = 280,
  onResize,
  onResetWidth,
}) => {
  // Collapsible sections
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const [entitiesOpen, setEntitiesOpen] = useState<boolean>(true);
  const [relationshipsOpen, setRelationshipsOpen] = useState<boolean>(true);
  const [quickSourcesOpen, setQuickSourcesOpen] = useState<boolean>(true);
  const [sourcesOpen, setSourcesOpen] = useState<boolean>(true);
  const [notesOpen, setNotesOpen] = useState<boolean>(true);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState<boolean>(false);

  // Explorer state (persisted per machine)
  const [view, setView] = useState<ExplorerView>(() => {
    try {
      return (localStorage.getItem('trace.explorer.view') as ExplorerView) || 'entities';
    } catch {
      return 'entities';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('trace.explorer.view', view);
    } catch {}
  }, [view]);
  const [filter, setFilter] = useState<string>('');
  const [entitySort, setEntitySort] = useState<'name' | 'degree'>('degree');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (t: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const { degreeMap, entityById } = useMemo(() => {
    const dm = new Map<string, number>();
    (projectData?.relationships || []).forEach((r) => {
      dm.set(r.source_entity, (dm.get(r.source_entity) || 0) + 1);
      dm.set(r.target_entity, (dm.get(r.target_entity) || 0) + 1);
    });
    const byId = new Map<string, Entity>();
    (projectData?.entities || []).forEach((e) => byId.set(e.id, e));
    return { degreeMap: dm, entityById: byId };
  }, [projectData?.relationships, projectData?.entities]);

  // New Quick Source Modal state
  const [newQuickSourceOpen, setNewQuickSourceOpen] = useState<boolean>(false);
  const [newQsTitle, setNewQsTitle] = useState<string>('');
  const [newQsUrl, setNewQsUrl] = useState<string>('');
  const [newQsType, setNewQsType] = useState<string>('webpage');
  const [newQsDesc, setNewQsDesc] = useState<string>('');
  const [newQsMethod, setNewQsMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [newQsHeaders, setNewQsHeaders] = useState<string>('');
  const [newQsBody, setNewQsBody] = useState<string>('');

  // API Quick Source Runner Modal state
  const [apiModalQs, setApiModalQs] = useState<QuickSource | null>(null);

  const OSINT_STARTER_PACK: Array<Omit<QuickSource, 'id' | 'created_at'>> = [
    {
      title: 'IP-API Geolocation (API)',
      url: 'http://ip-api.com/json/8.8.8.8',
      source_type: 'api',
      method: 'GET',
      description: 'Free IP geolocation and network lookup JSON API',
    },
    {
      title: 'Crt.sh Certificates (API)',
      url: 'https://crt.sh/?q=example.com&output=json',
      source_type: 'api',
      method: 'GET',
      description: 'Certificate transparency log search API',
    },
    {
      title: 'VirusTotal',
      url: 'https://www.virustotal.com',
      source_type: 'tool',
      description: 'Analyse suspicious files, domains, IPs and URLs',
    },
    {
      title: 'OSINT Framework',
      url: 'https://osintframework.com',
      source_type: 'tool',
      description: 'Directory of OSINT tools and resources',
    },
    {
      title: 'Wayback Machine',
      url: 'https://archive.org/web/',
      source_type: 'archive',
      description: 'Explore web pages saved over time',
    },
    {
      title: 'Shodan',
      url: 'https://www.shodan.io',
      source_type: 'database',
      description: 'Search engine for connected devices',
    },
    {
      title: 'WHOIS Lookup',
      url: 'https://who.is',
      source_type: 'webpage',
      description: 'Domain and IP WHOIS lookup',
    },
  ];

  // Custom Context Menu State
  const [contextMenu, setContextMenu] = useState<SidebarContextMenuState | null>(null);

  // Dismiss context menu on outside click or Esc
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-sidebar-context-menu]')) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const openContextMenu = (
    e: React.MouseEvent,
    itemType: 'entity' | 'relationship' | 'source' | 'note',
    itemId: string,
    itemTitle: string,
    extra?: any
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      itemType,
      itemId,
      itemTitle,
      extra,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  useEffect(() => {
    if (!projectSelectorOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest('[data-project-selector]') && !target.closest('[data-project-button]')) {
        setProjectSelectorOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [projectSelectorOpen]);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      onResize?.(startWidth + deltaX);
    };

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

  const q = filter.trim().toLowerCase();
  const entityList = projectData?.entities || [];
  const filteredEntities = q
    ? entityList.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.type.includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q))
      )
    : entityList;
  const sortedEntities = [...filteredEntities].sort((a, b) =>
    entitySort === 'degree'
      ? (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name)
  );
  const groupedEntities = ENTITY_TYPES.map((t) => ({
    type: t.type,
    label: t.label,
    color: t.color,
    items: sortedEntities.filter((e) => e.type === t.type),
  })).filter((g) => g.items.length > 0);

  const entityName = (id: string) => entityById.get(id)?.name || id;
  const filteredRels = (projectData?.relationships || []).filter(
    (r) =>
      !q ||
      r.type.toLowerCase().includes(q) ||
      entityName(r.source_entity).toLowerCase().includes(q) ||
      entityName(r.target_entity).toLowerCase().includes(q)
  );
  const filteredSources = (projectData?.sources || []).filter(
    (s) => !q || s.title.toLowerCase().includes(q) || (s.url || '').toLowerCase().includes(q)
  );
  const filteredNotes = (projectData?.notes || []).filter((n) => !q || n.title.toLowerCase().includes(q));
  const filteredQuick = quickSources.filter(
    (qs) => !q || qs.title.toLowerCase().includes(q) || (qs.url || '').toLowerCase().includes(q)
  );

  const views: { id: ExplorerView; label: string; count: number }[] = [
    { id: 'entities', label: 'Entities', count: entityList.length },
    { id: 'links', label: 'Links', count: projectData?.relationships.length || 0 },
    { id: 'sources', label: 'Sources', count: projectData?.sources.length || 0 },
    { id: 'notes', label: 'Notes', count: projectData?.notes.length || 0 },
    { id: 'tools', label: 'Bookmarks', count: quickSources.length },
  ];

  const handleAdd = () => {
    if (view === 'entities') onCreateEntityModal();
    else if (view === 'links') onCreateRelationshipModal();
    else if (view === 'sources') onCreateSourceModal();
    else if (view === 'notes') onCreateNoteModal();
    else setNewQuickSourceOpen(true);
  };
  const addLabel = { entities: 'New entity', links: 'New relationship', sources: 'New source', notes: 'New note', tools: 'Add bookmark / API' }[view];

  const Empty: React.FC<{ text: string }> = ({ text }) => (
    <div className="px-3 py-3 text-[11.5px] text-zinc-600">{q ? 'No matches' : text}</div>
  );

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-[var(--t-panel)] border-r border-[var(--t-border)] flex h-full overflow-hidden select-none text-[12px] relative shrink-0"
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={onResetWidth}
        className="absolute top-0 -right-px w-[5px] h-full cursor-col-resize z-40 hover:bg-[var(--t-accent)]/40 active:bg-[var(--t-accent)]/60"
        title="Drag to resize · double-click to reset"
      />

      {/* Activity rail */}
      <nav className="w-[38px] shrink-0 flex flex-col items-center py-1.5 gap-0.5 border-r border-[var(--t-border)] bg-[var(--t-bg)]">
        <RailButton active={activeTabType === 'graph'} title="Graph  (⌘G)" onClick={() => onOpenTab('graph', undefined, 'Interactive Graph')}>
          <Network />
        </RailButton>
        <RailButton active={activeTabType === 'overview'} title="Case brief  (⌘O)" onClick={() => onOpenTab('overview', undefined, 'Project Overview')}>
          <LayoutDashboard />
        </RailButton>
        <RailButton active={activeTabType === 'search'} title="Full-text search  (⌘F)" onClick={() => onOpenTab('search', undefined, 'Full-Text Search')}>
          <Search />
        </RailButton>
        <RailButton active={activeTabType === 'tools'} title="Tools — run OSINT tools, marketplace, MCP" onClick={() => onOpenTab('tools', undefined, 'Tools')}>
          <Blocks />
        </RailButton>
        <div className="flex-1" />
        {onImportData && activeProjectId && (
          <RailButton title="Import tool output (SpiderFoot, CSV, indicator list, JSON)" onClick={onImportData}>
            <FileInput />
          </RailButton>
        )}
        <RailButton title="Import case archive (.zip)" onClick={onImportZip}>
          <Upload />
        </RailButton>
        <RailButton title="Export case archive (.zip)" onClick={onExportZip}>
          <Download />
        </RailButton>
        {onOpenInExplorer && (
          <RailButton title={isDesktop ? 'Reveal case folder' : 'Download case files'} onClick={() => onOpenInExplorer(activeProjectId)}>
            <FolderOpen />
          </RailButton>
        )}
        <RailButton title="Rebuild full-text index" onClick={onRebuildIndex}>
          <RefreshCw />
        </RailButton>
        <div className="w-5 h-px bg-[var(--t-border)] my-1" />
        {onOpenShortcuts && (
          <RailButton title="Keyboard shortcuts  (?)" onClick={onOpenShortcuts}>
            <Keyboard />
          </RailButton>
        )}
        {onOpenSettings && (
          <RailButton title="Settings  (⌘,)" onClick={onOpenSettings}>
            <Settings />
          </RailButton>
        )}
      </nav>

      {/* Explorer */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-[28px] flex items-stretch border-b border-[var(--t-border)] shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`relative px-[7px] flex items-center gap-1 text-[11.5px] shrink-0 ${
                view === v.id
                  ? 'text-zinc-100 after:absolute after:inset-x-1.5 after:bottom-0 after:h-px after:bg-[var(--t-accent)]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>{v.label}</span>
              {view === v.id && <span className="font-mono text-[10px] text-zinc-500 tabular-nums">{v.count}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 px-1.5 py-1.5 border-b border-[var(--t-border-subtle)] shrink-0">
          <div className="relative flex-1 min-w-0">
            <Filter className="w-3 h-3 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFilter('');
              }}
              placeholder={`Filter ${view === 'links' ? 'relationships' : view}…`}
              className="t-input !pl-6"
            />
          </div>
          {view === 'entities' && (
            <button
              type="button"
              className="t-icon-btn"
              data-active={entitySort === 'degree'}
              onClick={() => setEntitySort(entitySort === 'degree' ? 'name' : 'degree')}
              title={entitySort === 'degree' ? 'Sorted by connections (click for A–Z)' : 'Sorted A–Z (click to sort by connections)'}
            >
              {entitySort === 'degree' ? <ArrowDownWideNarrow /> : <ArrowDownAZ />}
            </button>
          )}
          <button type="button" className="t-icon-btn" onClick={handleAdd} title={addLabel}>
            <Plus />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-0.5">
          {view === 'entities' &&
            (groupedEntities.length === 0 ? (
              <Empty text="No entities yet" />
            ) : (
              groupedEntities.map((g) => {
                const collapsed = collapsedGroups.has(g.type) && !q;
                return (
                  <div key={g.type}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.type)}
                      className="w-full h-[22px] flex items-center gap-1.5 pl-1.5 pr-2 text-zinc-500 hover:text-zinc-300 sticky top-0 bg-[var(--t-panel)] z-[1]"
                    >
                      <ChevronRight className={`w-3 h-3 shrink-0 ${collapsed ? '' : 'rotate-90'}`} />
                      <span className="t-swatch" style={{ background: g.color }} />
                      <span className="t-label !text-zinc-500 flex-1 text-left">{g.label}</span>
                      <span className="font-mono text-[10px] tabular-nums">{g.items.length}</span>
                    </button>
                    {!collapsed &&
                      g.items.map((entity) => {
                        const isActive = activeTabType === 'entity' && activeTargetId === entity.id;
                        const deg = degreeMap.get(entity.id) || 0;
                        return (
                          <div
                            key={entity.id}
                            data-selected={isActive}
                            onClick={() => onOpenTab('entity', entity.id, entity.name, { isPreview: true })}
                            onDoubleClick={() => onOpenTab('entity', entity.id, entity.name, { isPinned: true, isPreview: false })}
                            onContextMenu={(e) => openContextMenu(e, 'entity', entity.id, entity.name, { type: entity.type })}
                            className="t-row !pl-[26px]"
                            title={entity.aliases.length ? `${entity.name}\naka ${entity.aliases.join(', ')}` : entity.name}
                          >
                            <span className="truncate flex-1">{entity.name}</span>
                            {deg > 0 && <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{deg}</span>}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            ))}

          {view === 'links' &&
            (filteredRels.length === 0 ? (
              <Empty text="No relationships yet" />
            ) : (
              filteredRels.map((rel) => {
                const isActive = activeTabType === 'relationship' && activeTargetId === rel.id;
                return (
                  <div
                    key={rel.id}
                    data-selected={isActive}
                    onClick={() => onOpenTab('relationship', rel.id, `Rel: ${rel.type}`, { isPreview: true })}
                    onDoubleClick={() => onOpenTab('relationship', rel.id, `Rel: ${rel.type}`, { isPinned: true, isPreview: false })}
                    onContextMenu={(e) => openContextMenu(e, 'relationship', rel.id, `Rel: ${rel.type}`)}
                    className="t-row !h-[36px] !items-start !flex-col !gap-0 justify-center"
                  >
                    <div className="w-full flex items-center gap-1.5 min-w-0">
                      <StatusBadge status={rel.status} compact />
                      <span className="font-mono text-[11px] text-zinc-300 truncate">{rel.type}</span>
                      {rel.confidence != null && (
                        <span className="ml-auto font-mono text-[10px] text-zinc-600 tabular-nums">{rel.confidence}%</span>
                      )}
                    </div>
                    <div className="w-full truncate text-[11px] text-zinc-500 pl-[18px]">
                      {entityName(rel.source_entity)}
                      <span className="text-zinc-600">{rel.directed === false ? ' — ' : ' → '}</span>
                      {entityName(rel.target_entity)}
                    </div>
                  </div>
                );
              })
            ))}

          {view === 'sources' &&
            (filteredSources.length === 0 ? (
              <Empty text="No sources yet" />
            ) : (
              filteredSources.map((src) => {
                const isActive = activeTabType === 'source' && activeTargetId === src.id;
                return (
                  <div
                    key={src.id}
                    data-selected={isActive}
                    onClick={() => onOpenTab('source', src.id, src.title, { isPreview: true })}
                    onDoubleClick={() => onOpenTab('source', src.id, src.title, { isPinned: true, isPreview: false })}
                    onContextMenu={(e) => openContextMenu(e, 'source', src.id, src.title)}
                    className="t-row"
                    title={src.url || src.title}
                  >
                    <span className="truncate flex-1">{src.title}</span>
                    {isSourceQuickPinned?.(src.id) && <Bookmark className="w-3 h-3 text-zinc-500 shrink-0" />}
                    <span className="font-mono text-[10px] text-zinc-600 shrink-0">{src.source_type}</span>
                  </div>
                );
              })
            ))}

          {view === 'notes' &&
            (filteredNotes.length === 0 ? (
              <Empty text="No notes yet" />
            ) : (
              filteredNotes.map((note) => {
                const isActive = activeTabType === 'note' && activeTargetId === note.id;
                return (
                  <div
                    key={note.id}
                    data-selected={isActive}
                    onClick={() => onOpenTab('note', note.id, note.title, { isPreview: true })}
                    onDoubleClick={() => onOpenTab('note', note.id, note.title, { isPinned: true, isPreview: false })}
                    onContextMenu={(e) => openContextMenu(e, 'note', note.id, note.title)}
                    className="t-row"
                  >
                    <span className="truncate flex-1">{note.title}</span>
                    <span className="font-mono text-[10px] text-zinc-600 shrink-0 tabular-nums">
                      {(note.updated_at || '').slice(0, 10)}
                    </span>
                  </div>
                );
              })
            ))}

          {view === 'tools' && (
            <>
              {filteredQuick.map((qs) => (
                <div
                  key={qs.id}
                  onClick={() => {
                    if (qs.source_type === 'api') {
                      setApiModalQs(qs);
                    } else if (qs.projectId && qs.projectId === activeProjectId) {
                      onOpenTab('source', qs.id.replace('qs-', ''), qs.title, { isPreview: true });
                    } else if (qs.url && isSafeUrl(qs.url)) {
                      window.open(qs.url, '_blank');
                    }
                  }}
                  className="group t-row"
                  title={`${qs.title}${qs.url ? `\n${qs.url}` : ''}${qs.description ? `\n${qs.description}` : ''}`}
                >
                  <span className="font-mono text-[9.5px] w-8 shrink-0 text-zinc-500">
                    {qs.source_type === 'api' ? qs.method || 'GET' : 'WEB'}
                  </span>
                  <span className="truncate flex-1">{qs.title}</span>
                  <span className="hidden group-hover:flex items-center shrink-0">
                    {qs.source_type === 'api' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setApiModalQs(qs);
                        }}
                        className="p-0.5 text-zinc-500 hover:text-zinc-100"
                        title="Run request"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    {qs.url && (
                      <a
                        href={qs.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 text-zinc-500 hover:text-zinc-100"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {onRemoveQuickSource && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveQuickSource(qs.id);
                        }}
                        className="p-0.5 text-zinc-500 hover:text-rose-400"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {quickSources.length === 0 && (
                <div className="px-3 py-3 space-y-2">
                  <p className="text-[11.5px] text-zinc-600 leading-relaxed">
                    Bookmark lookup tools and JSON APIs you use across investigations.
                  </p>
                  {onAddQuickSource && (
                    <button
                      type="button"
                      onClick={() => OSINT_STARTER_PACK.forEach((tool) => onAddQuickSource(tool))}
                      className="t-btn"
                    >
                      Add common OSINT tools
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {currentProject && (
          <div className="h-[24px] shrink-0 flex items-center justify-between px-2.5 border-t border-[var(--t-border)] text-[10.5px] text-zinc-600">
            <span className="truncate font-mono">{currentProject.id}</span>
            <button
              type="button"
              onClick={() => onDeleteProject(currentProject.id)}
              className="text-zinc-600 hover:text-rose-400 shrink-0"
              title="Delete this investigation"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Custom Context Menu Everywhere in Sidebar */}
      {contextMenu && contextMenu.visible && (
        <div
          data-sidebar-context-menu
          className="t-menu fixed z-[80] w-52 select-none"
          style={{
            top: `${Math.min(contextMenu.y, window.innerHeight - 240)}px`,
            left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`,
          }}
        >
          <div className="px-2.5 pt-1 pb-1.5 border-b border-[var(--t-border)] mb-[3px]">
            <div className="text-[10px] uppercase font-mono text-zinc-400 font-semibold truncate">
              {contextMenu.itemType}
            </div>
            <div className="text-xs font-semibold text-white truncate">{contextMenu.itemTitle}</div>
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onOpenTab(contextMenu.itemType, contextMenu.itemId, contextMenu.itemTitle, { isPreview: true });
                setContextMenu(null);
              }}
              className="t-menu-item"
            >
              <ExternalLink className="w-3.5 h-3.5 text-obsidian-accent" />
              <span>Open in Preview</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenTab(contextMenu.itemType, contextMenu.itemId, contextMenu.itemTitle, { isPinned: true, isPreview: false });
                setContextMenu(null);
              }}
              className="t-menu-item"
            >
              <Pin className="w-3.5 h-3.5 opacity-70" />
              <span>Open & Pin Tab</span>
            </button>

            {contextMenu.itemType === 'entity' && (
              <button
                type="button"
                onClick={() => {
                  onCreateRelationshipModal(contextMenu.itemId);
                  setContextMenu(null);
                }}
                className="t-menu-item"
              >
                <Share2 className="w-3.5 h-3.5 opacity-70" />
                <span>Create Relationship...</span>
              </button>
            )}

            {contextMenu.itemType === 'source' && onTogglePinQuickSource && (
              <button
                type="button"
                onClick={() => {
                  onTogglePinQuickSource(contextMenu.itemId);
                  setContextMenu(null);
                }}
                className="t-menu-item"
              >
                <Bookmark />
                <span>{isSourceQuickPinned?.(contextMenu.itemId) ? 'Remove from Quick Access' : 'Pin to Quick Access'}</span>
              </button>
            )}

            <div className="t-menu-sep" />

            <button
              type="button"
              onClick={() => copyToClipboard(contextMenu.itemTitle)}
              className="t-menu-item"
            >
              <Copy />
              <span>Copy Title</span>
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(contextMenu.itemId)}
              className="t-menu-item"
            >
              <Hash />
              <span>Copy ID</span>
            </button>

            <div className="t-menu-sep" />

            <button
              type="button"
              onClick={() => {
                if (contextMenu.itemType === 'entity') onDeleteEntity?.(contextMenu.itemId);
                else if (contextMenu.itemType === 'relationship') onDeleteRelationship?.(contextMenu.itemId);
                else if (contextMenu.itemType === 'source') onDeleteSource?.(contextMenu.itemId);
                else if (contextMenu.itemType === 'note') onDeleteNote?.(contextMenu.itemId);
                setContextMenu(null);
              }}
              className="t-menu-item !text-rose-400 hover:!bg-rose-500/70 hover:!text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete {contextMenu.itemType}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal to add new Quick Source */}
      {newQuickSourceOpen && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
          <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded max-w-sm w-full shadow-popover text-xs">
            <div className="t-panel-head justify-between">
              <div className="text-[12px] font-semibold text-zinc-100">
                <span>Add tool or API</span>
              </div>
              <button
                type="button"
                onClick={() => setNewQuickSourceOpen(false)}
                className="text-obsidian-dim hover:text-white p-0.5 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newQsTitle.trim()) return;
                onAddQuickSource?.({
                  title: newQsTitle.trim(),
                  url: newQsUrl.trim() || undefined,
                  source_type: newQsType,
                  description: newQsDesc.trim() || undefined,
                  method: newQsType === 'api' ? newQsMethod : undefined,
                  headers: newQsType === 'api' && newQsHeaders.trim() ? newQsHeaders.trim() : undefined,
                  body: newQsType === 'api' && newQsBody.trim() ? newQsBody.trim() : undefined,
                });
                setNewQsTitle('');
                setNewQsUrl('');
                setNewQsDesc('');
                setNewQsHeaders('');
                setNewQsBody('');
                setNewQuickSourceOpen(false);
              }}
              className="space-y-3 p-3"
            >
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Source Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VirusTotal, Censys, WHOIS..."
                  value={newQsTitle}
                  onChange={(e) => setNewQsTitle(e.target.value)}
                  className="t-input"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">
                  {newQsType === 'api' ? 'API Endpoint URL *' : 'URL (optional)'}
                </label>
                <input
                  type="url"
                  required={newQsType === 'api'}
                  placeholder={newQsType === 'api' ? 'https://api.example.com/v1/...' : 'https://...'}
                  value={newQsUrl}
                  onChange={(e) => setNewQsUrl(e.target.value)}
                  className="t-input font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Type</label>
                <select
                  value={newQsType}
                  onChange={(e) => setNewQsType(e.target.value)}
                  className="t-input cursor-pointer"
                >
                  <option value="webpage">Webpage</option>
                  <option value="tool">OSINT Tool</option>
                  <option value="database">Database / Registry</option>
                  <option value="archive">Archive</option>
                  <option value="social">Social Media</option>
                  <option value="api">API Endpoint</option>
                </select>
              </div>

              {/* API Specific Fields */}
              {newQsType === 'api' && (
                <div className="pl-2.5 border-l border-[var(--t-border)] space-y-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <div className="w-1/3">
                      <label className="block text-[10px] text-zinc-500 mb-1 font-medium">Method</label>
                      <select
                        value={newQsMethod}
                        onChange={(e) => setNewQsMethod(e.target.value as any)}
                        className="w-full px-2 py-1 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-[var(--t-accent)]"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </div>

                    <div className="w-2/3">
                      <label className="block text-[10px] text-zinc-500 mb-1 font-medium">Headers (optional JSON)</label>
                      <input
                        type="text"
                        value={newQsHeaders}
                        onChange={(e) => setNewQsHeaders(e.target.value)}
                        placeholder='{"Accept": "application/json"}'
                        className="w-full px-2 py-1 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-[var(--t-accent)]"
                      />
                    </div>
                  </div>

                  {['POST', 'PUT', 'PATCH', 'DELETE'].includes(newQsMethod) && (
                    <div>
                      <label className="block text-[10px] text-zinc-500 mb-1 font-medium">Request Body</label>
                      <textarea
                        rows={2}
                        value={newQsBody}
                        onChange={(e) => setNewQsBody(e.target.value)}
                        placeholder='{"query": "example"}'
                        className="w-full p-2 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-[var(--t-accent)] resize-none"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-obsidian-border">
                <button
                  type="button"
                  onClick={() => setNewQuickSourceOpen(false)}
                  className="t-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newQsTitle.trim() || (newQsType === 'api' && !newQsUrl.trim())}
                  className="t-btn t-btn-primary"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive API Requester Modal */}
      {apiModalQs && (
        <ApiQuickSourceModal
          isOpen={!!apiModalQs}
          onClose={() => setApiModalQs(null)}
          quickSource={apiModalQs}
          onUpdateQuickSource={onUpdateQuickSource}
          entities={entities || projectData?.entities || []}
          onAttachSourceToEntity={onAttachSourceToEntity}
          onAddEntityAttribute={onAddEntityAttribute}
          onCreateNoteOnEntity={onCreateNoteOnEntity}
        />
      )}
    </aside>
  );
};
