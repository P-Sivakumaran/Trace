import { ReconPanel } from '@/components/ReconPanel';
import { AgentChatPanel } from '@/components/AgentChatPanel';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Entity,
  EntityType,
  GraphLayout,
  Note,
  Project,
  ProjectData,
  ProjectSummary,
  Relationship,
  RelationshipStatus,
  SearchResult,
  Source,
  QuickSource,
  Tab,
  TabType,
  Workspace,
} from '@/types';
import { getStorageService } from '@/services/storage';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { TabBar } from '@/components/layout/TabBar';
import { StatusBar } from '@/components/layout/StatusBar';
import { GraphView } from '@/features/graph/GraphView';
import { EntityEditor } from '@/features/entities/EntityEditor';
import { RelationshipEditor } from '@/features/relationships/RelationshipEditor';
import { SourceEditor } from '@/features/sources/SourceEditor';
import { NoteEditor } from '@/features/notes/NoteEditor';
import { ProjectOverview } from '@/features/projects/ProjectOverview';
import { SearchView } from '@/features/search/SearchView';
import { NewEntityModal } from '@/components/modals/NewEntityModal';
import { NewRelationshipModal } from '@/components/modals/NewRelationshipModal';
import { NewProjectModal } from '@/components/modals/NewProjectModal';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import { CommandPaletteModal } from '@/components/modals/CommandPaletteModal';
import { ShortcutsModal } from '@/components/modals/ShortcutsModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { createSampleProject } from '@/services/storage/sampleData';
import { getTransformById } from '@/services/transforms/registry';
import {
  SidebarClose,
  SidebarOpen,
  PanelRightClose,
  PanelRightOpen,
  Folder,
  FolderOpen,
  ChevronDown,
  Plus,
  Check,
  Search as SearchIcon,
} from 'lucide-react';
import saveAs from 'file-saver';

export function App() {
  const storage = getStorageService();

  // App State
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const activeProjectIdRef = useRef<string | undefined>(activeProjectId);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [graphPositions, setGraphPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(15);

  // Layout Panels State
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(true);

  // OS & Fullscreen detection
  const [platform] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.platform) {
      return (window as any).electronAPI.platform;
    }
    if (typeof navigator !== 'undefined') {
      if (/Mac/i.test(navigator.userAgent)) return 'darwin';
      if (/Win/i.test(navigator.userAgent)) return 'win32';
      if (/Linux/i.test(navigator.userAgent)) return 'linux';
    }
    return 'darwin';
  });

  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onFullScreenChange) {
      electronAPI.isFullScreen?.().then((full: boolean) => setIsFullScreen(!!full));
      return electronAPI.onFullScreenChange((full: boolean) => setIsFullScreen(full));
    } else {
      const handleFsChange = () => {
        setIsFullScreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }
  }, []);

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';

  // Sidebar Widths State (persisted in localStorage)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('trace_sidebar_left_width');
    return saved ? Math.max(220, Math.min(600, parseInt(saved, 10))) : 270;
  });
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('trace_sidebar_right_width');
    return saved ? Math.max(240, Math.min(650, parseInt(saved, 10))) : 300;
  });

  // Keep the central workspace usable on smaller displays (1280px and up):
  // side panels never take more than ~22–24% of the window each.
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveLeftWidth = Math.min(leftSidebarWidth, Math.max(230, Math.round(viewportWidth * 0.22)));
  const effectiveRightWidth = Math.min(rightSidebarWidth, Math.max(250, Math.round(viewportWidth * 0.24)));

  const handleLeftResize = (newWidth: number) => {
    const clamped = Math.max(220, Math.min(600, newWidth));
    setLeftSidebarWidth(clamped);
    localStorage.setItem('trace_sidebar_left_width', clamped.toString());
  };

  const handleRightResize = (newWidth: number) => {
    const clamped = Math.max(240, Math.min(650, newWidth));
    setRightSidebarWidth(clamped);
    localStorage.setItem('trace_sidebar_right_width', clamped.toString());
  };

  // Tabs State
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'tab-graph', type: 'graph', title: 'Interactive Graph' },
    { id: 'tab-overview', type: 'overview', title: 'Project Overview' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-graph');

  // Selection State
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | undefined>(undefined);

  // Modals State
  const [entityModalOpen, setEntityModalOpen] = useState<boolean>(false);
  const [entityModalDefaultType, setEntityModalDefaultType] = useState<EntityType | undefined>(undefined);
  const [relModalOpen, setRelModalOpen] = useState<boolean>(false);
  const [relModalDefaultSource, setRelModalDefaultSource] = useState<string | undefined>(undefined);
  const [relModalDefaultTarget, setRelModalDefaultTarget] = useState<string | undefined>(undefined);

  // Global Quick Sources (independent of project)
  const [quickSources, setQuickSources] = useState<QuickSource[]>(() => {
    try {
      const saved = localStorage.getItem('trace_quick_sources');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const saveQuickSources = useCallback(
    (newQuickSources: QuickSource[]) => {
      setQuickSources(newQuickSources);
      try {
        localStorage.setItem('trace_quick_sources', JSON.stringify(newQuickSources));
      } catch (err) {
        console.error('Failed to save quick sources to localStorage', err);
      }
      if (workspace) {
        storage.saveWorkspace({ ...workspace, quickSources: newQuickSources }).catch(() => {});
      }
    },
    [workspace, storage]
  );

  const handleAddQuickSource = (qs: Omit<QuickSource, 'id' | 'created_at'>) => {
    const newEntry: QuickSource = {
      ...qs,
      id: `qs-${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
    };
    const updated = [newEntry, ...quickSources.filter((s) => s.url !== newEntry.url || !s.url)];
    saveQuickSources(updated);
    showToast(`Added "${newEntry.title}" to Quick Access`);
  };

  const handleRemoveQuickSource = (id: string) => {
    const updated = quickSources.filter((s) => s.id !== id);
    saveQuickSources(updated);
    showToast('Removed from Quick Access');
  };

  const handleTogglePinSource = (sourceId: string) => {
    if (!projectData) return;
    const existingIndex = quickSources.findIndex((qs) => qs.id === sourceId || qs.id === `qs-${sourceId}`);
    if (existingIndex >= 0) {
      const updated = quickSources.filter((_, idx) => idx !== existingIndex);
      saveQuickSources(updated);
      showToast('Removed from Quick Access');
    } else {
      const src = projectData.sources.find((s) => s.id === sourceId);
      if (!src) return;
      const newEntry: QuickSource = {
        id: `qs-${src.id}`,
        title: src.title,
        url: src.url,
        source_type: src.source_type,
        projectId: activeProjectId,
        created_at: new Date().toISOString(),
      };
      saveQuickSources([newEntry, ...quickSources]);
      showToast(`Pinned "${src.title}" to Quick Access`);
    }
  };

  const isSourceQuickPinned = (sourceId: string) => {
    return quickSources.some((qs) => qs.id === sourceId || qs.id === `qs-${sourceId}`);
  };

  const handleUpdateQuickSource = (updatedQs: QuickSource) => {
    const updated = quickSources.map((qs) => (qs.id === updatedQs.id ? updatedQs : qs));
    saveQuickSources(updated);
  };

  const handleAttachSourceToEntity = async (
    entityId: string,
    sourceTitle: string,
    url: string,
    content: string
  ) => {
    if (!activeProjectId || !projectData) return;
    const targetEntity = projectData.entities.find((e) => e.id === entityId);
    if (!targetEntity) return;

    const newSourceId = `src-${Date.now().toString(36)}`;
    const newSource: Source = {
      id: newSourceId,
      type: 'source',
      title: sourceTitle,
      url: url,
      source_type: 'other',
      accessed_at: new Date().toISOString(),
      markdownBody: content,
    };
    await storage.saveSource(activeProjectId, newSource);

    const currentSources = Array.isArray(targetEntity.attributes?.sources)
      ? [...targetEntity.attributes.sources]
      : [];
    if (!currentSources.includes(newSourceId)) {
      currentSources.push(newSourceId);
    }
    const updatedEntity: Entity = {
      ...targetEntity,
      attributes: {
        ...targetEntity.attributes,
        sources: currentSources,
        last_api_source: newSourceId,
      },
      updated_at: new Date().toISOString(),
    };
    await storage.saveEntity(activeProjectId, updatedEntity);

    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: [newSource, ...prev.sources.filter((s) => s.id !== newSourceId)],
        entities: prev.entities.map((e) => (e.id === entityId ? updatedEntity : e)),
      };
    });
    showToast(`Linked API source to "${targetEntity.name}"`);
  };

  const handleAddEntityAttribute = async (entityId: string, key: string, value: any) => {
    if (!activeProjectId || !projectData) return;
    const targetEntity = projectData.entities.find((e) => e.id === entityId);
    if (!targetEntity) return;

    const updatedEntity: Entity = {
      ...targetEntity,
      attributes: {
        ...targetEntity.attributes,
        [key]: value,
      },
      updated_at: new Date().toISOString(),
    };
    await storage.saveEntity(activeProjectId, updatedEntity);
    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entities: prev.entities.map((e) => (e.id === entityId ? updatedEntity : e)),
      };
    });
    showToast(`Saved attribute "${key}" on "${targetEntity.name}"`);
  };

  const handleCreateNoteOnEntity = async (entityId: string, title: string, content: string) => {
    if (!activeProjectId || !projectData) return;
    const targetEntity = projectData.entities.find((e) => e.id === entityId);
    const newNoteId = `note-${Date.now().toString(36)}`;
    const newNote: Note = {
      id: newNoteId,
      type: 'note',
      title: title,
      tags: targetEntity ? [targetEntity.name, 'api_result'] : ['api_result'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      markdownBody: content,
    };
    await storage.saveNote(activeProjectId, newNote);
    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notes: [newNote, ...prev.notes.filter((n) => n.id !== newNoteId)],
      };
    });
    showToast(`Created note for "${targetEntity?.name || entityId}"`);
  };

  const handleBatchAddRelationships = async (
    newRels: Array<{
      source_entity: string;
      target_entity: string;
      type: string;
      status: RelationshipStatus;
      confidence?: number;
      evidence: string[];
    }>
  ) => {
    if (!activeProjectId || !projectData) return;
    const created: Relationship[] = [];

    for (let i = 0; i < newRels.length; i++) {
      const item = newRels[i];
      const relId = `rel-${Date.now().toString(36)}-${i}`;
      const rel: Relationship = {
        id: relId,
        type: item.type,
        source_entity: item.source_entity,
        target_entity: item.target_entity,
        directed: true,
        status: item.status, // 'unverified'
        confidence: item.confidence ?? null,
        evidence: item.evidence,
        created_at: new Date().toISOString(),
        markdownBody: `### Inferred Relationship\n\n- **Evidence:** ${item.evidence.join(', ')}\n- **Status:** ${item.status}\n`,
      };
      await storage.saveRelationship(activeProjectId, rel);
      created.push(rel);
    }

    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        relationships: [...prev.relationships, ...created],
      };
    });
    showToast(`Added ${created.length} unverified relationship${created.length === 1 ? '' : 's'}`);
  };

  const handleConfirmRelationship = async (relId: string) => {
    if (!activeProjectId || !projectData) return;
    const rel = projectData.relationships.find((r) => r.id === relId);
    if (!rel) return;
    const updated: Relationship = {
      ...rel,
      status: 'confirmed',
    };
    await storage.saveRelationship(activeProjectId, updated);
    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        relationships: prev.relationships.map((r) => (r.id === relId ? updated : r)),
      };
    });
    showToast(`Confirmed relationship: ${rel.type}`);
  };

  // Maltego Transform State & Execution
  const [activeRunningTransformId, setActiveRunningTransformId] = useState<string | undefined>(undefined);

  const handleBatchAddEntitiesAndRelationships = async (
    newEntities: Array<{
      id?: string;
      name: string;
      type: EntityType;
      attributes?: Record<string, any>;
      tags?: string[];
      position?: { x: number; y: number };
    }>,
    newRels: Array<{
      source_entity: string;
      target_entity: string;
      type: string;
      status?: RelationshipStatus;
      confidence?: number;
      evidence?: string[];
    }>,
    newPositions?: Record<string, { x: number; y: number }>
  ) => {
    if (!activeProjectId || !projectData) return;

    // Track entity names to IDs for connecting relationships
    const entityNameToId = new Map<string, string>();
    projectData.entities.forEach((e) => {
      entityNameToId.set(e.name.toLowerCase().trim(), e.id);
      entityNameToId.set(e.id, e.id);
    });

    const savedEntities: Entity[] = [];
    const updatedPositions: Record<string, { x: number; y: number }> = {
      ...(graphPositions || {}),
    };

    for (let i = 0; i < newEntities.length; i++) {
      const item = newEntities[i];
      const normalizedName = item.name.toLowerCase().trim();
      const existingId = entityNameToId.get(normalizedName);

      if (existingId) {
        // Map alias to existing ID so relationships connect properly
        if (item.id) entityNameToId.set(item.id, existingId);
        continue;
      }

      const entityId =
        item.id || `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      entityNameToId.set(normalizedName, entityId);
      if (item.id) entityNameToId.set(item.id, entityId);

      const now = new Date().toISOString();
      const entity: Entity = {
        id: entityId,
        name: item.name,
        type: item.type,
        aliases: [],
        tags: item.tags || [item.type],
        attributes: item.attributes || {},
        created_at: now,
        updated_at: now,
        markdownBody: `### Discovered Entity: ${item.name}\n\n- **Type:** ${item.type}\n- **Discovered:** ${new Date().toLocaleString()}\n`,
      };

      await storage.saveEntity(activeProjectId, entity);
      savedEntities.push(entity);

      if (item.position) {
        updatedPositions[entityId] = item.position;
      }
    }

    if (newPositions) {
      Object.assign(updatedPositions, newPositions);
    }

    // Save relationships
    const savedRels: Relationship[] = [];
    for (let i = 0; i < newRels.length; i++) {
      const relItem = newRels[i];
      const srcId =
        entityNameToId.get(relItem.source_entity.toLowerCase().trim()) || relItem.source_entity;
      const tgtId =
        entityNameToId.get(relItem.target_entity.toLowerCase().trim()) || relItem.target_entity;

      if (!srcId || !tgtId || srcId === tgtId) continue;

      // Avoid creating duplicates
      const exists = [...projectData.relationships, ...savedRels].some(
        (r) =>
          ((r.source_entity === srcId && r.target_entity === tgtId) ||
            (!r.directed && r.source_entity === tgtId && r.target_entity === srcId)) &&
          r.type === relItem.type
      );
      if (exists) continue;

      const relId = `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const rel: Relationship = {
        id: relId,
        type: relItem.type,
        source_entity: srcId,
        target_entity: tgtId,
        directed: true,
        status: relItem.status || 'unverified',
        confidence: relItem.confidence ?? 0.85,
        evidence: relItem.evidence || ['OSINT Transform Discovery'],
        created_at: new Date().toISOString(),
        markdownBody: `### Discovered Relationship\n\n- **Type:** ${relItem.type}\n- **Evidence:** ${(relItem.evidence || []).join(', ')}\n`,
      };

      await storage.saveRelationship(activeProjectId, rel);
      savedRels.push(rel);
    }

    // Persist layout positions
    if (Object.keys(updatedPositions).length > 0) {
      await storage.saveGraphLayout(activeProjectId, { positions: updatedPositions });
      setGraphPositions(updatedPositions);
    }

    // Update in-memory state
    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entities: [...prev.entities, ...savedEntities],
        relationships: [...prev.relationships, ...savedRels],
      };
    });

    if (savedEntities.length > 0 || savedRels.length > 0) {
      showToast(
        `Added ${savedEntities.length} new ${savedEntities.length === 1 ? 'entity' : 'entities'} and ${savedRels.length} relationship${savedRels.length === 1 ? '' : 's'}`
      );
    }
  };

  const handleCreateEntityAtPosition = async (
    type: EntityType,
    pos: { x: number; y: number },
    name?: string
  ) => {
    if (!activeProjectId) return;
    const defaultName = name && name.trim().length > 0 ? name.trim() : `New ${type}`;
    const entityId = `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const now = new Date().toISOString();
    const entity: Entity = {
      id: entityId,
      name: defaultName,
      type: type,
      aliases: [],
      tags: [type],
      attributes: {},
      created_at: now,
      updated_at: now,
      markdownBody: `### ${defaultName}\n\nCreated manually on ${new Date().toLocaleString()}\n`,
    };

    await storage.saveEntity(activeProjectId, entity);
    const updatedPositions = {
      ...graphPositions,
      [entityId]: pos,
    };
    await storage.saveGraphLayout(activeProjectId, { positions: updatedPositions });
    setGraphPositions(updatedPositions);

    setProjectData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entities: [...prev.entities, entity],
      };
    });

    setSelectedEntityId(entityId);
    showToast(`Created ${type} "${defaultName}"`);
  };

  const handleRunTransformFromSidebar = async (entity: Entity, transformId: string) => {
    if (!activeProjectId || !projectData) return;
    const transform = getTransformById(transformId);
    if (!transform) {
      showToast(`Transform "${transformId}" not found`);
      return;
    }

    setActiveRunningTransformId(transformId);
    showToast(`Executing "${transform.name}" on ${entity.name}...`);

    try {
      const logs: string[] = [];
      const result = await transform.run(entity, {
        allEntities: projectData.entities,
        signal: new AbortController().signal,
        log: (msg) => logs.push(msg),
      });

      const parentPos = graphPositions[entity.id] || { x: 400, y: 300 };
      const newPositions: Record<string, { x: number; y: number }> = {};

      const newEntities = result.newEntities.map((ent, idx) => {
        const total = result.newEntities.length || 1;
        const angle = (idx / total) * 2 * Math.PI + 0.2;
        const radius = 140 + (idx % 2) * 50;
        const pos = {
          x: Math.round(parentPos.x + Math.cos(angle) * radius),
          y: Math.round(parentPos.y + Math.sin(angle) * radius),
        };
        const entId = `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        newPositions[entId] = pos;
        return {
          id: entId,
          name: ent.name,
          type: ent.type,
          attributes: ent.attributes,
          tags: ent.tags,
          position: pos,
        };
      });

      const newRels = result.newRelationships.map((r) => ({
        source_entity: entity.id,
        target_entity: r.targetEntityName,
        type: r.type,
        status: r.status || 'confirmed',
        confidence: r.confidence ?? 1.0,
        evidence: r.evidence || [`Discovered via ${transform.name}`],
      }));

      await handleBatchAddEntitiesAndRelationships(newEntities, newRels, newPositions);
      showToast(`Completed ${transform.name}: found ${result.newEntities.length} entities`);
    } catch (err: any) {
      console.error(`Transform ${transformId} failed:`, err);
      showToast(`Error running ${transform.name}: ${err?.message || 'Failed'}`);
    } finally {
      setActiveRunningTransformId(undefined);
    }
  };

  const [projectModalOpen, setProjectModalOpen] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);

  // Delete modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    filePaths: string[];
    warningMessage?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    filePaths: [],
    warningMessage: undefined,
    onConfirm: () => {},
  });

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Open Project / Workspace in Finder or Explorer
  const handleOpenInExplorer = async (projectId?: string) => {
    const targetId = projectId || activeProjectId;
    try {
      const opened = await storage.openInExplorer(targetId);
      if (opened) {
        showToast(storage.isDesktop() ? 'Opening in Finder...' : 'Downloaded project archive (.zip)');
      }
    } catch (e) {
      console.error('Failed to open folder:', e);
      showToast('Could not open folder on disk');
    }
  };

  // Project Switcher Dropdown State
  const [projectSelectorOpen, setProjectSelectorOpen] = useState<boolean>(false);
  const projectSelectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectSelectorOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (projectSelectorRef.current && !projectSelectorRef.current.contains(e.target as Node)) {
        setProjectSelectorOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [projectSelectorOpen]);

  // Hidden File input ref for ZIP import
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load Workspace and Projects
  const loadWorkspaceData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(20);
      const ws = await storage.getWorkspace();
      setWorkspace(ws);
      if (ws.quickSources && ws.quickSources.length > 0) {
        setQuickSources((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const newFromWs = ws.quickSources!.filter((s) => !ids.has(s.id));
          return [...prev, ...newFromWs];
        });
      }
      setLoadingProgress(40);

      // Yield thread briefly to keep UI and progress bar completely smooth
      await new Promise((resolve) => setTimeout(resolve, 60));

      let projs = await storage.listProjects();
      const sample = createSampleProject();
      setLoadingProgress(60);

      // Ensure the Getting Started tutorial project exists for everyone
      const existingActiveId = ws.activeProjectId;
      if (!projs.some((p) => p.id === sample.project.id)) {
        try {
          await storage.createProject(sample.project.name, (sample.project as any).description || '', sample.project.id);
          await storage.saveProject(sample.project);
          await Promise.all([
            ...sample.entities.map((ent) => storage.saveEntity(sample.project.id, ent)),
            ...sample.relationships.map((rel) => storage.saveRelationship(sample.project.id, rel)),
            ...sample.sources.map((src) => storage.saveSource(sample.project.id, src)),
            ...sample.notes.map((note) => storage.saveNote(sample.project.id, note)),
          ]);
          // Restore user's previous active project if they had one
          if (existingActiveId && existingActiveId !== sample.project.id) {
            const updatedWs = await storage.getWorkspace();
            updatedWs.activeProjectId = existingActiveId;
            await storage.saveWorkspace(updatedWs);
            ws.activeProjectId = existingActiveId;
          }
        } catch (e) {
          console.warn('Seeding getting-started error:', e);
        }
        projs = await storage.listProjects();
      }

      setProjects(projs);
      setLoadingProgress(75);
      await new Promise((resolve) => setTimeout(resolve, 60));

      let targetProjectId = ws.activeProjectId || sample.project.id;
      if (targetProjectId) {
        setActiveProjectId(targetProjectId);
        let data = await storage.getProject(targetProjectId);
        if (!data && projs.length > 0) {
          data = await storage.getProject(projs[0].id);
          setActiveProjectId(projs[0].id);
        }
        setProjectData(data);
        setLoadingProgress(90);
        const layout = await storage.getGraphLayout(targetProjectId);
        setGraphPositions(layout.positions || {});
      }
      setLoadingProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.error('Failed to load workspace:', err);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setInitialLoading(false);
      }, 250);
    }
  }, [storage]);

  // Change working folder
  const handleChangeWorkingFolder = async () => {
    if (!storage.selectDirectory) return;
    try {
      const selected = await storage.selectDirectory();
      if (!selected) return;
      const folderName = selected.split('/').filter(Boolean).pop() || selected;
      showToast(`Switched working folder to ${folderName}`);
      setTabs([
        {
          id: 'graph',
          type: 'graph',
          title: 'Interactive Graph',
          isPinned: true,
          isPreview: false,
        },
      ]);
      setActiveTabId('graph');
      await loadWorkspaceData();
    } catch (err) {
      console.error('Failed to change working folder:', err);
      showToast('Failed to switch working folder');
    }
  };

  useEffect(() => {
    loadWorkspaceData();

    // Listen to external/storage changes
    const unsubscribe = storage.onStorageChange((event) => {
      const currentId = activeProjectIdRef.current;
      if (currentId) {
        storage.getProject(currentId).then((data) => {
          if (data && activeProjectIdRef.current === currentId) setProjectData(data);
        });
      }
      storage.listProjects().then(setProjects);
    });

    return () => {
      unsubscribe();
    };
  }, [loadWorkspaceData, storage]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      // Cmd/Ctrl + [: Toggle Left Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        setLeftSidebarOpen((prev) => !prev);
      }
      // Cmd/Ctrl + ]: Toggle Right Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        setRightSidebarOpen((prev) => !prev);
      }
      // Cmd/Ctrl + G: Jump to Graph
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        openTab('graph', undefined, 'Interactive Graph');
      }
      // Cmd/Ctrl + O: Jump to Overview
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openTab('overview', undefined, 'Project Overview');
      }
      // Cmd/Ctrl + F: Search Tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openTab('search', undefined, 'Full-Text Search');
      }
      // Cmd/Ctrl + ,: Open Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsModalOpen((prev) => !prev);
      }
      // ? or Cmd/Ctrl + /: Open Shortcuts
      if (
        (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) ||
        ((e.metaKey || e.ctrlKey) && e.key === '/')
      ) {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Switch Active Project
  const handleSelectProject = async (projectId: string) => {
    if (projectId === activeProjectId) return;
    setIsLoading(true);
    setActiveProjectId(projectId);

    if (workspace) {
      await storage.saveWorkspace({ ...workspace, activeProjectId: projectId });
    }

    const data = await storage.getProject(projectId);
    setProjectData(data);
    const layout = await storage.getGraphLayout(projectId);
    setGraphPositions(layout.positions || {});

    // Reset tabs to default for new project
    setTabs([
      { id: 'tab-graph', type: 'graph', title: 'Interactive Graph' },
      { id: 'tab-overview', type: 'overview', title: 'Project Overview' },
    ]);
    setActiveTabId('tab-graph');
    setSelectedEntityId(undefined);
    setSelectedRelationshipId(undefined);
    setIsLoading(false);
    showToast(`Switched to project: ${data?.project.name}`);
  };

  // Tab Navigation Actions
  const openTab = (
    type: TabType,
    targetId?: string,
    title?: string,
    options?: { isPreview?: boolean; isPinned?: boolean }
  ) => {
    const tabId = targetId ? `tab-${type}-${targetId}` : `tab-${type}`;
    const existingIndex = tabs.findIndex((t) => t.id === tabId);

    if (existingIndex >= 0) {
      if (options?.isPinned) {
        setTabs((prev) => {
          const target = prev.find((t) => t.id === tabId);
          if (!target) return prev;
          const updated = { ...target, isPinned: true, isPreview: false };
          const others = prev.filter((t) => t.id !== tabId);
          const pinned = others.filter((t) => t.isPinned);
          const unpinned = others.filter((t) => !t.isPinned);
          return [...pinned, updated, ...unpinned];
        });
      } else if (options?.isPreview === false) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, isPreview: false } : t))
        );
      }
      setActiveTabId(tabId);
    } else {
      const defaultTitle =
        title ||
        (type === 'graph'
          ? 'Interactive Graph'
          : type === 'overview'
          ? 'Project Overview'
          : type === 'search'
          ? 'Full-Text Search'
          : `${type.toUpperCase()} Record`);

      const wantsPreview =
        options?.isPreview ?? (type === 'entity' || type === 'relationship' || type === 'source' || type === 'note');

      // Check if there is an unpinned, clean preview tab that can be replaced (like VS Code!)
      const replaceablePreviewIndex = tabs.findIndex(
        (t) =>
          t.isPreview &&
          !t.isDirty &&
          !t.isPinned &&
          t.type !== 'graph' &&
          t.type !== 'overview' &&
          t.type !== 'search'
      );

      const newTab: Tab = {
        id: tabId,
        type,
        targetId,
        title: defaultTitle,
        isPinned: options?.isPinned ?? false,
        isPreview: wantsPreview,
        isDirty: false,
      };

      if (newTab.isPinned) {
        // Pinned tab joins pinned section after existing pinned tabs
        setTabs((prev) => {
          const pinned = prev.filter((t) => t.isPinned);
          const unpinned = prev.filter((t) => !t.isPinned);
          return [...pinned, newTab, ...unpinned];
        });
      } else if (wantsPreview && replaceablePreviewIndex >= 0) {
        setTabs((prev) => {
          const updated = [...prev];
          updated[replaceablePreviewIndex] = newTab;
          return updated;
        });
      } else {
        setTabs((prev) => [...prev, newTab]);
      }
      setActiveTabId(tabId);
    }

    if (type === 'entity' && targetId) {
      setSelectedEntityId(targetId);
      setSelectedRelationshipId(undefined);
    } else if (type === 'relationship' && targetId) {
      setSelectedRelationshipId(targetId);
      setSelectedEntityId(undefined);
    }
  };

  const closeTab = (tabId: string) => {
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      setActiveTabId(nextTabs.length ? nextTabs[nextTabs.length - 1].id : '');
    }
  };

  const togglePinTab = (tabId: string) => {
    setTabs((prev) => {
      const target = prev.find((t) => t.id === tabId);
      if (!target) return prev;
      const willPin = !target.isPinned;
      const updated: Tab = {
        ...target,
        isPinned: willPin,
        isPreview: false,
      };
      const others = prev.filter((t) => t.id !== tabId);
      const pinned = others.filter((t) => t.isPinned);
      const unpinned = others.filter((t) => !t.isPinned);

      if (willPin) {
        // Becomes first if no pinned existed, or placed after existing pinned tabs
        return [...pinned, updated, ...unpinned];
      } else {
        // When unpinning, moves to start of unpinned tabs
        return [...pinned, updated, ...unpinned];
      }
    });
  };

  const closeOtherTabs = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id === tabId || t.isPinned));
    setActiveTabId(tabId);
  };

  const closeTabsToRight = (tabId: string) => {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    setTabs((prev) => prev.filter((t, i) => i <= idx || t.isPinned));
    setActiveTabId(tabId);
  };

  const setTabDirty = (tabId: string, isDirty: boolean) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, isDirty, isPreview: isDirty ? false : t.isPreview } : t
      )
    );
  };

  // Entity Actions
  const handleSaveEntity = async (entity: Entity) => {
    if (!activeProjectId) return;
    await storage.saveEntity(activeProjectId, entity);
    const updated = await storage.getProject(activeProjectId);
    setProjectData(updated);
    showToast(`Entity "${entity.name}" saved`);
  };

  const handleDeleteEntity = (entityId: string) => {
    if (!activeProjectId || !projectData) return;
    const entity = projectData.entities.find((e) => e.id === entityId);
    const name = entity ? entity.name : entityId;

    const connectedRels = projectData.relationships.filter(
      (r) => r.source_entity === entityId || r.target_entity === entityId
    );

    setDeleteModalState({
      isOpen: true,
      title: 'Delete Entity',
      itemName: name,
      filePaths: [
        `projects/${activeProjectId}/entities/${entityId}.md`,
        ...connectedRels.map((r) => `projects/${activeProjectId}/relationships/${r.id}.md`),
      ],
      warningMessage:
        connectedRels.length > 0
          ? `Deleting this entity will also remove ${connectedRels.length} connected relationship record(s).`
          : undefined,
      onConfirm: async () => {
        await storage.deleteEntity(activeProjectId, entityId);
        const updated = await storage.getProject(activeProjectId);
        setProjectData(updated);
        closeTab(`tab-entity-${entityId}`);
        if (selectedEntityId === entityId) setSelectedEntityId(undefined);
        showToast(`Entity "${name}" deleted`);
      },
    });
  };

  // Relationship Actions
  const handleSaveRelationship = async (rel: Relationship) => {
    if (!activeProjectId) return;
    await storage.saveRelationship(activeProjectId, rel);
    const updated = await storage.getProject(activeProjectId);
    setProjectData(updated);
    showToast(`Relationship "${rel.type}" saved`);
  };

  const handleDeleteRelationship = (relId: string) => {
    if (!activeProjectId || !projectData) return;
    const rel = projectData.relationships.find((r) => r.id === relId);
    const name = rel ? `Relationship: ${rel.type}` : relId;

    setDeleteModalState({
      isOpen: true,
      title: 'Delete Relationship',
      itemName: name,
      filePaths: [`projects/${activeProjectId}/relationships/${relId}.md`],
      onConfirm: async () => {
        await storage.deleteRelationship(activeProjectId, relId);
        const updated = await storage.getProject(activeProjectId);
        setProjectData(updated);
        closeTab(`tab-relationship-${relId}`);
        if (selectedRelationshipId === relId) setSelectedRelationshipId(undefined);
        showToast(`Relationship deleted`);
      },
    });
  };

  // Source Actions
  const handleSaveSource = async (source: Source) => {
    if (!activeProjectId) return;
    await storage.saveSource(activeProjectId, source);
    const updated = await storage.getProject(activeProjectId);
    setProjectData(updated);
    showToast(`Source "${source.title}" saved`);
  };

  const handleDeleteSource = (sourceId: string) => {
    if (!activeProjectId || !projectData) return;
    const src = projectData.sources.find((s) => s.id === sourceId);
    const name = src ? src.title : sourceId;

    setDeleteModalState({
      isOpen: true,
      title: 'Delete Source',
      itemName: name,
      filePaths: [`projects/${activeProjectId}/sources/${sourceId}.md`],
      warningMessage:
        'Any relationship records citing this source will have their evidence references updated.',
      onConfirm: async () => {
        await storage.deleteSource(activeProjectId, sourceId);
        const updated = await storage.getProject(activeProjectId);
        setProjectData(updated);
        closeTab(`tab-source-${sourceId}`);
        showToast(`Source "${name}" deleted`);
      },
    });
  };

  // Note Actions
  const handleSaveNote = async (note: Note) => {
    if (!activeProjectId) return;
    await storage.saveNote(activeProjectId, note);
    const updated = await storage.getProject(activeProjectId);
    setProjectData(updated);
    showToast(`Note "${note.title}" saved`);
  };

  const handleDeleteNote = (noteId: string) => {
    if (!activeProjectId || !projectData) return;
    const note = projectData.notes.find((n) => n.id === noteId);
    const name = note ? note.title : noteId;

    setDeleteModalState({
      isOpen: true,
      title: 'Delete Note',
      itemName: name,
      filePaths: [`projects/${activeProjectId}/notes/${noteId}.md`],
      onConfirm: async () => {
        await storage.deleteNote(activeProjectId, noteId);
        const updated = await storage.getProject(activeProjectId);
        setProjectData(updated);
        closeTab(`tab-note-${noteId}`);
        showToast(`Note "${name}" deleted`);
      },
    });
  };

  // Project Actions
  const handleCreateProject = async (name: string, description: string) => {
    const proj = await storage.createProject(name, description);
    await loadWorkspaceData();
    openTab('overview', undefined, 'Project Overview');
    showToast(`Created project: ${proj.name}`);
  };

  const handleDeleteProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    const name = proj ? proj.name : projectId;

    setDeleteModalState({
      isOpen: true,
      title: 'Delete Investigation Project',
      itemName: name,
      filePaths: [
        `projects/${projectId}/project.md`,
        `projects/${projectId}/graph-layout.json`,
        `projects/${projectId}/entities/ (*.md)`,
        `projects/${projectId}/relationships/ (*.md)`,
        `projects/${projectId}/sources/ (*.md)`,
        `projects/${projectId}/notes/ (*.md)`,
        `SQLite Index records for ${projectId}`,
      ],
      warningMessage:
        'This will permanently delete the entire project directory and all canonical Markdown files.',
      onConfirm: async () => {
        await storage.deleteProject(projectId);
        await loadWorkspaceData();
        showToast(`Deleted project: ${name}`);
      },
    });
  };

  // Save layout positions
  const handleSavePositions = async (positions: Record<string, { x: number; y: number }>) => {
    if (!activeProjectId) return;
    await storage.saveGraphLayout(activeProjectId, { positions });
    setGraphPositions(positions);
    showToast('Graph node layout positions saved');
  };

  // Rebuild Index
  const handleRebuildIndex = async () => {
    if (!activeProjectId) return;
    await storage.rebuildIndex(activeProjectId);
    showToast('SQLite full-text index rebuilt from Markdown records');
  };

  // Export ZIP
  const handleExportZip = async () => {
    if (!activeProjectId || !projectData) return;
    try {
      const blob = await storage.exportProjectZip(activeProjectId);
      saveAs(blob, `${projectData.project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-export.zip`);
      showToast('Project exported as canonical Markdown ZIP');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed');
    }
  };

  // Import ZIP
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Importing project archive...');
      const importedId = await storage.importProjectZip(file);
      await loadWorkspaceData();
      setActiveProjectId(importedId);
      openTab('overview', undefined, 'Project Overview');
      showToast('Project imported successfully');
    } catch (err) {
      console.error('Import failed:', err);
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const [reconOpen, setReconOpen] = useState(false);
  const [reconSection, setReconSection] = useState<'collect' | 'assistant'>('collect');
  const [agentOpen, setAgentOpen] = useState(false);
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const activeTab: Tab | undefined = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-obsidian-bg text-obsidian-text font-sans relative">
      {/* App Startup Loading Screen */}
      {initialLoading && (
        <div
          className="fixed inset-0 z-[100] bg-[var(--t-bg)] flex flex-col items-center justify-center select-none"
          style={{ WebkitAppRegion: 'drag' as any }}
        >
          <div className="w-64 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-semibold tracking-[0.08em] text-zinc-200">TRACE</span>
              <span className="text-[10px] font-mono text-zinc-500">{__APP_VERSION__}</span>
            </div>
            <div className="h-px w-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-[var(--t-accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${Math.min(100, Math.max(8, loadingProgress))}%` }}
              />
            </div>
            {__BUILD_HASH__ && (
              <div className="text-[10px] font-mono text-zinc-600 truncate select-text" title={__BUILD_HASH__}>
                sha256 {__BUILD_HASH__}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden File Input for ZIP Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleImportFileChange}
        className="hidden"
      />

      {/* Title bar: window chrome, investigation context, document tabs */}
      <header
        className="h-[30px] bg-[var(--t-panel)] border-b border-[var(--t-border)] flex items-stretch select-none shrink-0 relative z-[60]"
        style={{ WebkitAppRegion: 'drag' as any }}
      >
        {isElectron && isMac && !isFullScreen && <div className="w-[76px] shrink-0 pointer-events-none" />}

        <div className="flex items-center px-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
          <button
            type="button"
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className="t-icon-btn"
            data-active={leftSidebarOpen}
            title={`${leftSidebarOpen ? 'Hide' : 'Show'} explorer  (⌘[)`}
          >
            {leftSidebarOpen ? <SidebarClose /> : <SidebarOpen />}
          </button>
        </div>

        {/* Investigation switcher */}
        <div
          ref={projectSelectorRef}
          className="relative flex items-stretch shrink-0 border-r border-[var(--t-border)]"
          style={{ WebkitAppRegion: 'no-drag' as any }}
        >
          <button
            type="button"
            onClick={() => setProjectSelectorOpen(!projectSelectorOpen)}
            className={`flex items-center gap-1.5 px-2.5 max-w-[260px] text-[12px] hover:bg-[var(--t-hover)] ${
              projectSelectorOpen ? 'bg-[var(--t-hover)]' : ''
            }`}
            title={currentProject?.name}
          >
            <span className="t-label !text-[9.5px] shrink-0">Case</span>
            <span className="font-medium text-zinc-100 truncate">
              {currentProject ? currentProject.name : 'Select investigation'}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          </button>

          {projectSelectorOpen && (
            <div className="t-menu absolute top-full left-0 mt-px w-80 z-50">
              <div className="px-2.5 pt-1 pb-1.5 flex items-center justify-between">
                <span className="t-label">Investigations</span>
                <span className="text-[10px] text-zinc-500 font-mono">{projects.length}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {projects.map((p) => {
                  const isActive = p.id === activeProjectId;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        handleSelectProject(p.id);
                        setProjectSelectorOpen(false);
                      }}
                      className="t-menu-item"
                    >
                      <span className="w-3 shrink-0">{isActive && <Check />}</span>
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="text-[10px] font-mono opacity-60 shrink-0">{p.entityCount}</span>
                    </button>
                  );
                })}
              </div>
              <div className="t-menu-sep" />
              <button
                type="button"
                onClick={() => {
                  setProjectSelectorOpen(false);
                  setProjectModalOpen(true);
                }}
                className="t-menu-item"
              >
                <Plus />
                <span>New investigation…</span>
              </button>
              {storage.isDesktop() && (
                <button
                  type="button"
                  onClick={() => {
                    setProjectSelectorOpen(false);
                    handleChangeWorkingFolder();
                  }}
                  className="t-menu-item"
                >
                  <Folder />
                  <span>Choose working folder…</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setProjectSelectorOpen(false);
                  handleOpenInExplorer(activeProjectId);
                }}
                className="t-menu-item"
              >
                <FolderOpen />
                <span>{storage.isDesktop() ? 'Reveal in Finder' : 'Download project files'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Document tabs */}
        <div className="flex-1 min-w-0 flex items-stretch">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={closeTab}
            onNewTab={() => openTab('graph', undefined, 'Interactive Graph', { isPinned: true })}
            onTogglePinTab={togglePinTab}
            onCloseOtherTabs={closeOtherTabs}
            onCloseTabsToRight={closeTabsToRight}
            onReorderTabs={setTabs}
          />
        </div>

        <div className="flex items-center gap-0.5 px-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="h-[22px] flex items-center gap-2 pl-2 pr-1 mr-1 text-[11.5px] text-zinc-500 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-[3px] hover:text-zinc-300 hover:border-zinc-700 w-64 max-[1100px]:w-44"
            title="Command palette"
          >
            <SearchIcon className="w-3 h-3 shrink-0" />
            <span className="flex-1 text-left truncate">Go to anything…</span>
            <span className="t-kbd">⌘K</span>
          </button>
          {projectData && (
            <button
              type="button"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="t-icon-btn"
              data-active={rightSidebarOpen}
              title={`${rightSidebarOpen ? 'Hide' : 'Show'} inspector  (⌘])`}
            >
              {rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
          )}
        </div>

        {isElectron && isWin && !isFullScreen && <div className="w-[138px] shrink-0 pointer-events-none" />}
      </header>

      {/* Main Body Below Top Header */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar */}
        {leftSidebarOpen && workspace && (
          <LeftSidebar
            isOpen={leftSidebarOpen}
            onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
            workspace={workspace}
            projects={projects}
            activeProjectId={activeProjectId}
            projectData={projectData}
            onSelectProject={handleSelectProject}
            onCreateProjectModal={() => setProjectModalOpen(true)}
            onDeleteProject={handleDeleteProject}
            activeTabType={activeTab?.type}
            activeTargetId={activeTab?.targetId}
            onOpenTab={openTab}
            onCreateEntityModal={(defaultType) => {
              setEntityModalDefaultType(defaultType);
              setEntityModalOpen(true);
            }}
            onCreateRelationshipModal={(sourceId) => {
              setRelModalDefaultSource(sourceId);
              setRelModalDefaultTarget(undefined);
              setRelModalOpen(true);
            }}
            quickSources={quickSources}
            onAddQuickSource={handleAddQuickSource}
            onRemoveQuickSource={handleRemoveQuickSource}
            onTogglePinQuickSource={handleTogglePinSource}
            isSourceQuickPinned={isSourceQuickPinned}
            entities={projectData?.entities || []}
            onAttachSourceToEntity={handleAttachSourceToEntity}
            onAddEntityAttribute={handleAddEntityAttribute}
            onCreateNoteOnEntity={handleCreateNoteOnEntity}
            onUpdateQuickSource={handleUpdateQuickSource}
            onCreateSourceModal={() => {
              if (!activeProjectId) return;
              const now = new Date().toISOString();
              const newSource: Source = {
                id: `src-${Date.now().toString(36)}`,
                type: 'source',
                title: 'New Evidence Source',
                accessed_at: now,
                source_type: 'webpage',
                markdownBody: '# New Source\n\n## Extract\n\nRecord excerpt...\n\n## Notes\n\nNotes...',
              };
              storage.saveSource(activeProjectId, newSource).then(async () => {
                const updated = await storage.getProject(activeProjectId);
                setProjectData(updated);
                openTab('source', newSource.id, newSource.title);
              });
            }}
            onCreateNoteModal={() => {
              if (!activeProjectId) return;
              const now = new Date().toISOString();
              const newNote: Note = {
                id: `note-${Date.now().toString(36)}`,
                type: 'note',
                title: 'Investigation Note',
                tags: [],
                created_at: now,
                updated_at: now,
                markdownBody: '# Investigation Note\n\nRecord observations...',
              };
              storage.saveNote(activeProjectId, newNote).then(async () => {
                const updated = await storage.getProject(activeProjectId);
                setProjectData(updated);
                openTab('note', newNote.id, newNote.title);
              });
            }}
            onExportZip={handleExportZip}
            onImportZip={() => fileInputRef.current?.click()}
            onRebuildIndex={handleRebuildIndex}
            onDeleteEntity={handleDeleteEntity}
            onDeleteRelationship={handleDeleteRelationship}
            onDeleteSource={handleDeleteSource}
            onDeleteNote={handleDeleteNote}
            isDesktop={storage.isDesktop()}
            onOpenInExplorer={handleOpenInExplorer}
            onOpenSettings={() => setSettingsModalOpen(true)}
            onOpenShortcuts={() => setShortcutsModalOpen(true)}
            width={effectiveLeftWidth}
            onResize={handleLeftResize}
            onResetWidth={() => handleLeftResize(270)}
          />
        )}

        {/* Center Main Workspace */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--t-bg)] min-w-[420px]">
          {activeProjectId && <div className="flex flex-wrap border-b shrink-0"><button className="t-btn min-h-11 px-4 text-left" onClick={() => { setReconSection('collect'); setReconOpen(true); }}>Recon &amp; MCP</button><button className="t-btn min-h-11 px-4 text-left" onClick={() => setAgentOpen(true)}>Case agent</button></div>}
          {/* Tab Content Canvas */}
        <div className="flex-1 overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-x-0 top-0 z-20 h-px bg-[var(--t-accent)] animate-pulse">
              <span className="sr-only">Loading investigation…</span>
            </div>
          )}

          {!isLoading && !projectData && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-xs text-obsidian-muted gap-3">
              <p>No active investigation project loaded.</p>
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="t-btn"
              >
                Reset and reload workspace
              </button>
            </div>
          )}

          {projectData && !activeTab && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--t-bg)]">
              <div className="w-[300px] text-[12px]">
                <div className="t-label mb-2 px-2">Open</div>
                {[
                  { label: 'Graph', hint: '⌘G', run: () => openTab('graph', undefined, 'Interactive Graph') },
                  { label: 'Case brief', hint: '⌘O', run: () => openTab('overview', undefined, 'Project Overview') },
                  { label: 'Full-text search', hint: '⌘F', run: () => openTab('search', undefined, 'Full-Text Search') },
                  { label: 'Go to anything…', hint: '⌘K', run: () => setCommandPaletteOpen(true) },
                ].map((a) => (
                  <button key={a.label} type="button" onClick={a.run} className="t-row w-full !h-[26px] !px-2 justify-between rounded-[3px]">
                    <span>{a.label}</span>
                    <span className="t-kbd">{a.hint}</span>
                  </button>
                ))}
                <div className="t-label mt-4 mb-2 px-2">Create</div>
                {[
                  { label: 'New entity…', run: () => setEntityModalOpen(true) },
                  { label: 'New relationship…', run: () => setRelModalOpen(true) },
                  { label: 'New investigation…', run: () => setProjectModalOpen(true) },
                ].map((a) => (
                  <button key={a.label} type="button" onClick={a.run} className="t-row w-full !h-[26px] !px-2 rounded-[3px]">
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {projectData && activeTab && (
            <>
              {activeTab.type === 'graph' && (
                <GraphView
                  projectData={projectData}
                  selectedEntityId={selectedEntityId}
                  selectedRelationshipId={selectedRelationshipId}
                  onSelectEntity={(id) => {
                    setSelectedEntityId(id);
                    setSelectedRelationshipId(undefined);
                  }}
                  onSelectRelationship={(id) => {
                    setSelectedRelationshipId(id);
                    setSelectedEntityId(undefined);
                  }}
                  onOpenEntity={(id) => {
                    const e = projectData.entities.find((ent) => ent.id === id);
                    openTab('entity', id, e ? e.name : id);
                  }}
                  onOpenRelationship={(id) => {
                    const r = projectData.relationships.find((rel) => rel.id === id);
                    openTab('relationship', id, r ? `Rel: ${r.type}` : id);
                  }}
                  onOpenNote={(id) => {
                    const n = projectData.notes.find((nt) => nt.id === id);
                    openTab('note', id, n ? n.title : id);
                  }}
                  onCreateEntity={() => setEntityModalOpen(true)}
                  onCreateRelationshipFromEntity={(sourceId, targetId) => {
                    setRelModalDefaultSource(sourceId);
                    setRelModalDefaultTarget(targetId);
                    setRelModalOpen(true);
                  }}
                  onDeleteEntity={handleDeleteEntity}
                  onDeleteRelationship={handleDeleteRelationship}
                  onDeleteNote={handleDeleteNote}
                  initialPositions={graphPositions}
                  onSavePositions={handleSavePositions}
                  onBatchAddRelationships={handleBatchAddRelationships}
                  onConfirmRelationship={handleConfirmRelationship}
                  onBatchAddEntitiesAndRelationships={handleBatchAddEntitiesAndRelationships}
                  onCreateEntityAtPosition={handleCreateEntityAtPosition}
                  activeRunningTransformId={activeRunningTransformId}
                />
              )}

              {activeTab.type === 'overview' && (
                <ProjectOverview
                  projectData={projectData}
                  onSaveProject={(p) => storage.saveProject(p)}
                  onOpenGraph={() => openTab('graph', undefined, 'Interactive Graph')}
                  onCreateEntity={() => setEntityModalOpen(true)}
                  onCreateRelationship={() => setRelModalOpen(true)}
                  onExportZip={handleExportZip}
                  onRebuildIndex={handleRebuildIndex}
                  onOpenEntity={(id) => {
                    const e = projectData.entities.find((ent) => ent.id === id);
                    openTab('entity', id, e ? e.name : id);
                  }}
                  onOpenInExplorer={() => handleOpenInExplorer()}
                />
              )}

              {activeTab.type === 'entity' && activeTab.targetId && (
                (() => {
                  const entity = projectData.entities.find((e) => e.id === activeTab.targetId);
                  if (!entity) {
                    return (
                      <div className="p-8 text-center text-obsidian-dim">
                        Entity not found or has been deleted.
                      </div>
                    );
                  }
                  return (
                    <EntityEditor
                      entity={entity}
                      projectData={projectData}
                      onSave={handleSaveEntity}
                      onDelete={handleDeleteEntity}
                      onOpenEntity={(id) => {
                        const e = projectData.entities.find((ent) => ent.id === id);
                        openTab('entity', id, e ? e.name : id);
                      }}
                      onOpenRelationship={(id) => {
                        const r = projectData.relationships.find((rel) => rel.id === id);
                        openTab('relationship', id, r ? `Rel: ${r.type}` : id);
                      }}
                      onCreateRelationship={(sourceId) => {
                        setRelModalDefaultSource(sourceId);
                        setRelModalOpen(true);
                      }}
                      onShowInGraph={(id) => {
                        setSelectedEntityId(id);
                        openTab('graph', undefined, 'Interactive Graph');
                      }}
                      onDirtyChange={(dirty) => setTabDirty(activeTab.id, dirty)}
                    />
                  );
                })()
              )}

              {activeTab.type === 'relationship' && activeTab.targetId && (
                (() => {
                  const rel = projectData.relationships.find((r) => r.id === activeTab.targetId);
                  if (!rel) {
                    return (
                      <div className="p-8 text-center text-obsidian-dim">
                        Relationship not found or has been deleted.
                      </div>
                    );
                  }
                  return (
                    <RelationshipEditor
                      relationship={rel}
                      projectData={projectData}
                      onSave={handleSaveRelationship}
                      onDelete={handleDeleteRelationship}
                      onOpenEntity={(id) => {
                        const e = projectData.entities.find((ent) => ent.id === id);
                        openTab('entity', id, e ? e.name : id);
                      }}
                      onOpenSource={(id) => {
                        const s = projectData.sources.find((src) => src.id === id);
                        openTab('source', id, s ? s.title : id);
                      }}
                      onShowInGraph={(id) => {
                        setSelectedRelationshipId(id);
                        openTab('graph', undefined, 'Interactive Graph');
                      }}
                    />
                  );
                })()
              )}

              {activeTab.type === 'source' && activeTab.targetId && (
                (() => {
                  const src = projectData.sources.find((s) => s.id === activeTab.targetId);
                  if (!src) {
                    return (
                      <div className="p-8 text-center text-obsidian-dim">
                        Source not found or has been deleted.
                      </div>
                    );
                  }
                  return (
                    <SourceEditor
                      source={src}
                      projectData={projectData}
                      onSave={handleSaveSource}
                      onDelete={handleDeleteSource}
                      onOpenRelationship={(id) => {
                        const r = projectData.relationships.find((rel) => rel.id === id);
                        openTab('relationship', id, r ? `Rel: ${r.type}` : id);
                      }}
                      onOpenEntity={(id) => {
                        const e = projectData.entities.find((ent) => ent.id === id);
                        openTab('entity', id, e ? e.name : id);
                      }}
                      isQuickPinned={isSourceQuickPinned(src.id)}
                      onToggleQuickPin={() => handleTogglePinSource(src.id)}
                    />
                  );
                })()
              )}

              {activeTab.type === 'note' && activeTab.targetId && (
                (() => {
                  const note = projectData.notes.find((n) => n.id === activeTab.targetId);
                  if (!note) {
                    return (
                      <div className="p-8 text-center text-obsidian-dim">
                        Note not found or has been deleted.
                      </div>
                    );
                  }
                  return (
                    <NoteEditor
                      note={note}
                      projectData={projectData}
                      onSave={handleSaveNote}
                      onDelete={handleDeleteNote}
                      onOpenEntity={(id) => {
                        const e = projectData.entities.find((ent) => ent.id === id);
                        openTab('entity', id, e ? e.name : id);
                      }}
                    />
                  );
                })()
              )}

              {activeTab.type === 'search' && activeProjectId && (
                <SearchView
                  onSearch={(q) => storage.search(activeProjectId, q)}
                  onSelectResult={(res) => {
                    if (res.type === 'entity') {
                      openTab('entity', res.id, res.title);
                    } else if (res.type === 'relationship') {
                      openTab('relationship', res.id, res.title);
                    } else if (res.type === 'source') {
                      openTab('source', res.id, res.title);
                    } else if (res.type === 'note') {
                      openTab('note', res.id, res.title);
                    } else if (res.type === 'project') {
                      openTab('overview', undefined, 'Project Overview');
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Right Sidebar Context Inspector */}
      {projectData && (
        <RightSidebar
          isOpen={rightSidebarOpen}
          onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
          projectData={projectData}
          selectedEntityId={selectedEntityId}
          selectedRelationshipId={selectedRelationshipId}
          onOpenEntity={(id) => {
            const e = projectData.entities.find((ent) => ent.id === id);
            openTab('entity', id, e ? e.name : id);
          }}
          onOpenRelationship={(id) => {
            const r = projectData.relationships.find((rel) => rel.id === id);
            openTab('relationship', id, r ? `Rel: ${r.type}` : id);
          }}
          onOpenSource={(id) => {
            const s = projectData.sources.find((src) => src.id === id);
            openTab('source', id, s ? s.title : id);
          }}
          onCreateRelationship={(sourceId) => {
            setRelModalDefaultSource(sourceId);
            setRelModalOpen(true);
          }}
          onRunTransform={handleRunTransformFromSidebar}
          activeRunningTransformId={activeRunningTransformId}
          width={effectiveRightWidth}
          onResize={handleRightResize}
          onResetWidth={() => handleRightResize(300)}
        />
      )}
      </div>

      <StatusBar
        projectData={projectData}
        selectedEntityId={selectedEntityId}
        selectedRelationshipId={selectedRelationshipId}
        isDesktop={storage.isDesktop()}
        isLoading={isLoading}
        message={toastMessage}
      />

      {/* Modals */}
      <NewEntityModal
        isOpen={entityModalOpen}
        onClose={() => setEntityModalOpen(false)}
        onCreate={async (newEntity) => {
          if (!activeProjectId) return;
          await handleSaveEntity(newEntity);
          openTab('entity', newEntity.id, newEntity.name);
        }}
        defaultType={entityModalDefaultType}
      />

      {projectData && (
        <NewRelationshipModal
          isOpen={relModalOpen}
          onClose={() => {
            setRelModalOpen(false);
            setRelModalDefaultSource(undefined);
            setRelModalDefaultTarget(undefined);
          }}
          onCreate={async (newRel) => {
            if (!activeProjectId) return;
            await handleSaveRelationship(newRel);
            openTab('relationship', newRel.id, `Rel: ${newRel.type}`);
          }}
          projectData={projectData}
          defaultSourceId={relModalDefaultSource}
          defaultTargetId={relModalDefaultTarget}
        />
      )}

      <NewProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <DeleteConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalState.onConfirm}
        title={deleteModalState.title}
        itemName={deleteModalState.itemName}
        filePathsToDelete={deleteModalState.filePaths}
        warningMessage={deleteModalState.warningMessage}
      />

      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        projectData={projectData}
        onOpenTab={openTab}
        onCreateEntity={() => setEntityModalOpen(true)}
        onCreateRelationship={() => setRelModalOpen(true)}
      />

      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      {reconOpen && activeProjectId && <ReconPanel key={activeProjectId} caseId={activeProjectId} caseName={currentProject?.name} initialSection={reconSection} onClose={() => setReconOpen(false)} onImported={async () => { const updated = await storage.getProject(activeProjectId); setProjectData(previous => previous?.project.id === activeProjectId ? updated : previous); }} />}
      {agentOpen && activeProjectId && <AgentChatPanel key={activeProjectId} caseId={activeProjectId} caseName={currentProject?.name} onClose={() => setAgentOpen(false)} onReview={() => { setAgentOpen(false); setReconSection('assistant'); setReconOpen(true); }} onOpenSource={id => { setAgentOpen(false); openTab('source', id, projectData?.sources.find(source => source.id === id)?.title ?? id); }} />}

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        workspace={workspace}
        activeProjectId={activeProjectId}
        isDesktop={storage.isDesktop()}
        onSelectDirectory={handleChangeWorkingFolder}
        onOpenInExplorer={handleOpenInExplorer}
        onExportZip={handleExportZip}
        onRebuildIndex={handleRebuildIndex}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
      />

    </div>
  );
}

export default App;
