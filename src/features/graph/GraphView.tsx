import React, { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import {
  Entity,
  EntityType,
  ENTITY_TYPES,
  ProjectData,
  Relationship,
  RelationshipStatus,
  RELATIONSHIP_STATUSES,
} from '@/types';
import { EntityIcon, getEntityTypeColor, getEntityTypeLabel } from '@/components/common/EntityIcon';
import { findSpatialCandidate, type Direction } from './spatialNavigation';
import { StatusGlyph } from '@/components/common/StatusBadge';
import {
  Maximize2,
  RotateCcw,
  Search,
  Filter,
  SlidersHorizontal,
  BookmarkCheck,
  Eye,
  EyeOff,
  Crosshair,
  Plus,
  Share2,
  Trash2,
  ExternalLink,
  Layers,
  Save,
  Copy,
  Hash,
  FileText,
  StickyNote,
  X,
  Tag,
  ChevronDown,
  ScanSearch,
  CheckCheck,
  Activity,
  Boxes,
  Zap,
  MousePointer,
  Grid,
  CircleDot,
  GitFork,
  ArrowDownLeft,
  ArrowUpRight,
  FolderTree,
} from 'lucide-react';
import { RelationshipDiscoveryModal } from '@/components/modals/RelationshipDiscoveryModal';
import { EntityPalette } from './EntityPalette';
import { TransformConsole } from './TransformConsole';
import { getTransformsForEntity, TRANSFORMS_REGISTRY } from '@/services/transforms/registry';
import { TransformDefinition, TransformLogEntry } from '@/services/transforms/types';
import {
  computeForceLayout,
  defaultIterations,
  selectVisibleLabels,
  type LabelCandidate,
  type LayoutEdge,
  type LayoutNode,
} from './forceLayout';
import {
  GRAPH_BG,
  GRAPH_EDGE_COLORS,
  GRAPH_EDGE_STYLE,
  GRAPH_NODE_COLORS,
  GRAPH_SELECT,
  graphNodeColor,
  nodeDiameter,
} from './graphTheme';

const ToolSep: React.FC = () => <div className="w-px h-4 bg-[var(--t-border)] mx-1 shrink-0" />;

interface GraphViewProps {
  projectData: ProjectData;
  selectedEntityId?: string;
  selectedRelationshipId?: string;
  onSelectEntity: (entityId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onOpenEntity: (entityId: string) => void;
  onOpenRelationship: (relationshipId: string) => void;
  onOpenNote?: (noteId: string) => void;
  onCreateEntity: () => void;
  onCreateRelationshipFromEntity: (sourceEntityId: string, targetEntityId?: string) => void;
  onDeleteEntity: (entityId: string) => void;
  onDeleteRelationship: (relationshipId: string) => void;
  onDeleteNote?: (noteId: string) => void;
  initialPositions?: Record<string, { x: number; y: number }>;
  onSavePositions?: (positions: Record<string, { x: number; y: number }>) => void;
  onBatchAddRelationships?: (
    newRels: Array<{
      source_entity: string;
      target_entity: string;
      type: string;
      status: RelationshipStatus;
      confidence?: number;
      evidence: string[];
    }>
  ) => void;
  onBatchAddEntitiesAndRelationships?: (
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
  ) => Promise<void> | void;
  onCreateEntityAtPosition?: (
    type: EntityType,
    pos: { x: number; y: number },
    name?: string
  ) => Promise<void> | void;
  onConfirmRelationship?: (relationshipId: string) => void;
  activeRunningTransformId?: string;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetType: 'background' | 'node' | 'edge';
  targetId?: string;
  isNote?: boolean;
}

interface HoveredNodeState {
  id: string;
  x: number;
  y: number;
  isNote?: boolean;
}

export const GraphView: React.FC<GraphViewProps> = ({
  projectData,
  selectedEntityId,
  selectedRelationshipId,
  onSelectEntity,
  onSelectRelationship,
  onOpenEntity,
  onOpenRelationship,
  onOpenNote,
  onCreateEntity,
  onCreateRelationshipFromEntity,
  onDeleteEntity,
  onDeleteRelationship,
  onDeleteNote,
  initialPositions,
  onSavePositions,
  onBatchAddRelationships,
  onBatchAddEntitiesAndRelationships,
  onCreateEntityAtPosition,
  onConfirmRelationship,
  activeRunningTransformId,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null);

  // Discovery Modal state
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState<boolean>(false);

  // Maltego UX States
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [sizeByDegree, setSizeByDegree] = useState<boolean>(true);
  const [clusterLeaves, setClusterLeaves] = useState<boolean>(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState<boolean>(false);
  const [transformLogs, setTransformLogs] = useState<TransformLogEntry[]>([]);
  const [isRunningTransform, setIsRunningTransform] = useState<boolean>(false);
  const [activeRunningTransform, setActiveRunningTransform] = useState<{
    name: string;
    entityName: string;
    entityId: string;
  } | null>(null);

  // Dropped entity prompt from Palette
  const [droppedEntityPrompt, setDroppedEntityPrompt] = useState<{
    isOpen: boolean;
    type: EntityType;
    position: { x: number; y: number };
    screenX: number;
    screenY: number;
  } | null>(null);
  const [droppedEntityName, setDroppedEntityName] = useState<string>('');

  // Responsive container width tracking
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width || 1000);
    return () => observer.disconnect();
  }, []);

  // Toolbar density tiers: labels go first, then the layout segment, then secondary toggles.
  const isMedium = containerWidth < 1180;
  const isCompact = containerWidth < 900;
  const isNarrow = containerWidth < 700;

  // Graph Controls State
  const [layoutName, setLayoutName] = useState<string>('force');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [showNotesOnGraph, setShowNotesOnGraph] = useState<boolean>(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState<boolean>(false);

  // Entity Type and Status Filters
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<Set<EntityType>>(
    new Set(ENTITY_TYPES.map((t) => t.type))
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<RelationshipStatus>>(
    new Set(RELATIONSHIP_STATUSES.map((s) => s.status))
  );

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetType: 'background',
  });

  // Hover State & Toast
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dragging Relationship Connection State (Key C / Alt / Option or Node Handle or Connect Mode)
  const [isConnectKeyPressed, setIsConnectKeyPressed] = useState<boolean>(false);
  const isConnectKeyPressedRef = useRef<boolean>(false);
  const [isConnectModeActive, setIsConnectModeActive] = useState<boolean>(false);
  const isConnectModeActiveRef = useRef<boolean>(false);

  const connectionDragRef = useRef<{
    sourceId: string;
    sourceName: string;
    sourceType: EntityType;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    targetId?: string;
    targetName?: string;
  } | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<{
    sourceId: string;
    sourceName: string;
    sourceType: EntityType;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    targetId?: string;
    targetName?: string;
  } | null>(null);

  const sourceNodeInitialPosRef = useRef<{ x: number; y: number } | null>(null);
  const isInitialFitDoneRef = useRef<boolean>(false);
  const callbacksRef = useRef<{
    onSelectEntity: (id: string) => void;
    onSelectRelationship: (id: string) => void;
    onOpenEntity: (id: string) => void;
    onOpenRelationship: (id: string) => void;
    onOpenNote?: (id: string) => void;
    focusedNodeId: string | null;
    clearFocus: () => void;
  }>({
    onSelectEntity,
    onSelectRelationship,
    onOpenEntity,
    onOpenRelationship,
    onOpenNote,
    focusedNodeId,
    clearFocus: () => {},
  });

  useEffect(() => {
    callbacksRef.current = {
      onSelectEntity,
      onSelectRelationship,
      onOpenEntity,
      onOpenRelationship,
      onOpenNote,
      focusedNodeId,
      clearFocus,
    };
  });

  useEffect(() => {
    isInitialFitDoneRef.current = false;
  }, [projectData.project.id]);

  // Helper to find target node at mouse position with generous snap hitbox
  const getTargetNodeAtPoint = (
    cy: Core,
    container: HTMLDivElement,
    clientX: number,
    clientY: number,
    sourceId: string
  ): { id: string; name: string } | null => {
    const rect = container.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    let bestNode: any = null;
    let minDistance = Infinity;

    const nodes = cy.nodes();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id() === sourceId || n.data('isNote')) continue;

      const bb = n.renderedBoundingBox();
      const centerX = (bb.x1 + bb.x2) / 2;
      const centerY = (bb.y1 + bb.y2) / 2;
      const halfW = (bb.x2 - bb.x1) / 2;
      const halfH = (bb.y2 - bb.y1) / 2;
      const threshold = Math.max(halfW, halfH, 20) + 32;

      const dist = Math.hypot(relX - centerX, relY - centerY);
      if (dist <= threshold && dist < minDistance) {
        minDistance = dist;
        bestNode = n;
      }
    }

    if (bestNode) {
      const ent = projectData.entities.find((e) => e.id === bestNode.id());
      return {
        id: bestNode.id(),
        name: ent ? ent.name : bestNode.id(),
      };
    }
    return null;
  };

  // Start Connection Drag from a source entity node
  const startConnectionDrag = (
    sourceId: string,
    sourceName: string,
    sourceType: EntityType,
    startX: number,
    startY: number,
    initialClientX: number,
    initialClientY: number
  ) => {
    const cy = cyRef.current;
    if (cy) {
      const srcNode = cy.$id(sourceId);
      if (srcNode.length > 0) {
        sourceNodeInitialPosRef.current = { ...srcNode.position() };
        srcNode.addClass('connecting-source');
      }
      cy.autoungrabify(true);
    }

    const dragInfo = {
      sourceId,
      sourceName,
      sourceType,
      startX,
      startY,
      currentX: initialClientX,
      currentY: initialClientY,
      targetId: undefined,
      targetName: undefined,
    };
    connectionDragRef.current = dragInfo;
    setConnectionDrag(dragInfo);
    setHoveredNode(null);

    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      const cur = connectionDragRef.current;
      if (!cur) return;

      const clientX = e.clientX;
      const clientY = e.clientY;
      const activeCy = cyRef.current;
      const container = containerRef.current;

      let targetId: string | undefined = undefined;
      let targetName: string | undefined = undefined;

      if (activeCy && container) {
        const found = getTargetNodeAtPoint(activeCy, container, clientX, clientY, cur.sourceId);
        if (found) {
          targetId = found.id;
          targetName = found.name;
        }

        activeCy.nodes().forEach((n) => {
          if (targetId && n.id() === targetId) {
            n.addClass('connecting-target');
          } else {
            n.removeClass('connecting-target');
          }
        });
      }

      const updated = {
        ...cur,
        currentX: clientX,
        currentY: clientY,
        targetId,
        targetName,
      };
      connectionDragRef.current = updated;
      setConnectionDrag(updated);
    };

    const onPointerUp = (e: PointerEvent | MouseEvent) => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('mousemove', onPointerMove, { capture: true });
      window.removeEventListener('mouseup', onPointerUp, { capture: true });

      const cur = connectionDragRef.current;
      connectionDragRef.current = null;
      setConnectionDrag(null);

      const activeCy = cyRef.current;
      const container = containerRef.current;

      let finalTargetId = cur?.targetId;

      if (activeCy && container && cur && !finalTargetId) {
        const found = getTargetNodeAtPoint(activeCy, container, e.clientX, e.clientY, cur.sourceId);
        if (found) {
          finalTargetId = found.id;
        }
      }

      if (activeCy) {
        activeCy.elements().removeClass('connecting-source connecting-target');
        if (cur && sourceNodeInitialPosRef.current) {
          const srcNode = activeCy.$id(cur.sourceId);
          if (srcNode.length > 0) {
            srcNode.position(sourceNodeInitialPosRef.current);
          }
        }
        if (!isConnectKeyPressedRef.current && !isConnectModeActiveRef.current) {
          activeCy.autoungrabify(false);
        }
      }

      sourceNodeInitialPosRef.current = null;

      if (cur && finalTargetId && finalTargetId !== cur.sourceId) {
        onCreateRelationshipFromEntity(cur.sourceId, finalTargetId);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('mousemove', onPointerMove, { capture: true });
    window.addEventListener('mouseup', onPointerUp, { capture: true });
  };

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;

      const isC = e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key === 'с';
      const isAlt = e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';

      if ((isC || isAlt) && !e.repeat) {
        setIsConnectKeyPressed(true);
        isConnectKeyPressedRef.current = true;
        cyRef.current?.autoungrabify(true);
      }

      if (e.key === 'Escape') {
        if (connectionDragRef.current) {
          connectionDragRef.current = null;
          setConnectionDrag(null);
          cyRef.current?.elements().removeClass('connecting-source connecting-target');
        }
        if (isConnectModeActiveRef.current) {
          setIsConnectModeActive(false);
          isConnectModeActiveRef.current = false;
        }
        setIsConnectKeyPressed(false);
        isConnectKeyPressedRef.current = false;
        cyRef.current?.autoungrabify(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isC = e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key === 'с';
      const isAlt = e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';

      if (isC || isAlt) {
        setIsConnectKeyPressed(false);
        isConnectKeyPressedRef.current = false;
        if (!connectionDragRef.current && !isConnectModeActiveRef.current) {
          cyRef.current?.autoungrabify(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const toggleConnectMode = () => {
    setIsConnectModeActive((prev) => {
      const next = !prev;
      isConnectModeActiveRef.current = next;
      cyRef.current?.autoungrabify(next || isConnectKeyPressedRef.current);
      if (next) {
        showToast('Connect Mode active: Drag from any node to connect');
      }
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard`);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // Memoized entities/notes for context menu and hover card
  const selectedNodeEntity = useMemo(() => {
    if (contextMenu.targetType !== 'node' || !contextMenu.targetId || contextMenu.isNote) return null;
    return projectData.entities.find((e) => e.id === contextMenu.targetId) || null;
  }, [contextMenu.targetType, contextMenu.targetId, contextMenu.isNote, projectData.entities]);

  const selectedNodeNote = useMemo(() => {
    if (contextMenu.targetType !== 'node' || !contextMenu.targetId || !contextMenu.isNote) return null;
    return (projectData.notes || []).find((n) => n.id === contextMenu.targetId) || null;
  }, [contextMenu.targetType, contextMenu.targetId, contextMenu.isNote, projectData.notes]);

  const selectedEdge = useMemo(() => {
    if (contextMenu.targetType !== 'edge' || !contextMenu.targetId) return null;
    return projectData.relationships.find((r) => r.id === contextMenu.targetId) || null;
  }, [contextMenu.targetType, contextMenu.targetId, projectData.relationships]);

  const edgeSourceEntity = useMemo(() => {
    if (!selectedEdge) return null;
    const s = selectedEdge.source_entity || (selectedEdge as any).source;
    return projectData.entities.find((e) => e.id === s);
  }, [selectedEdge, projectData.entities]);

  const edgeTargetEntity = useMemo(() => {
    if (!selectedEdge) return null;
    const t = selectedEdge.target_entity || (selectedEdge as any).target;
    return projectData.entities.find((e) => e.id === t);
  }, [selectedEdge, projectData.entities]);

  const hoveredEntity = useMemo(() => {
    if (!hoveredNode || hoveredNode.isNote) return null;
    return projectData.entities.find((e) => e.id === hoveredNode.id) || null;
  }, [hoveredNode, projectData.entities]);

  const hoveredNote = useMemo(() => {
    if (!hoveredNode || !hoveredNode.isNote) return null;
    return (projectData.notes || []).find((n) => n.id === hoveredNode.id) || null;
  }, [hoveredNode, projectData.notes]);

  const hoveredEntityRelations = useMemo(() => {
    if (!hoveredEntity) return [];
    return projectData.relationships.filter(
      (r) =>
        (r.source_entity || (r as any).source) === hoveredEntity.id ||
        (r.target_entity || (r as any).target) === hoveredEntity.id
    );
  }, [hoveredEntity, projectData.relationships]);

  const hoveredEntityNotesPreview = useMemo(() => {
    if (!hoveredEntity || !hoveredEntity.markdownBody) return null;
    const cleaned = hoveredEntity.markdownBody
      .replace(/^---[\s\S]*?---\s*/, '')
      .replace(/^[#*>\-\s]+/gm, '')
      .trim();
    if (!cleaned) return null;
    return cleaned.slice(0, 110) + (cleaned.length > 110 ? '...' : '');
  }, [hoveredEntity]);

  // Global escape and outside click handlers for custom context menu
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        setHoveredNode(null);
      }
    };
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-context-menu]')) {
        setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('pointerdown', handleGlobalClick);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('pointerdown', handleGlobalClick);
    };
  }, []);

  // Build Cytoscape Elements (Entities + Notes + Relationships)
  const elements = useMemo(() => {
    const relSrc = (r: Relationship) => r.source_entity || (r as any).source;
    const relTgt = (r: Relationship) => r.target_entity || (r as any).target;
    const entityById = new Map<string, Entity>();
    const entityByName = new Map<string, Entity>();
    projectData.entities.forEach((e) => {
      entityById.set(e.id, e);
      entityByName.set(e.name.toLowerCase(), e);
    });

    // Degree drives node size, label priority and layout mass.
    const degreeMap = new Map<string, number>();
    (projectData.relationships || []).forEach((r) => {
      const s = relSrc(r);
      const t = relTgt(r);
      if (s) degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
      if (t) degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
    });
    let maxDegree = 1;
    degreeMap.forEach((d) => {
      if (d > maxDegree) maxDegree = d;
    });
    const sizeFor = (deg: number) => (sizeByDegree ? nodeDiameter(deg, maxDegree) : 10);

    // Detect leaves for Collection Nodes (if clusterLeaves is enabled)
    const clusteredLeafIds = new Set<string>();
    const collectionNodes: any[] = [];
    const collectionEdges: any[] = [];

    if (clusterLeaves) {
      const parentToTypeLeaves = new Map<string, Map<EntityType, Entity[]>>();
      (projectData.relationships || []).forEach((r) => {
        const s = relSrc(r);
        const t = relTgt(r);
        if (!s || !t) return;
        if ((degreeMap.get(t) || 0) === 1 && (degreeMap.get(s) || 0) > 1) {
          const targetEntity = entityById.get(t);
          if (targetEntity && selectedEntityTypes.has(targetEntity.type) && !hiddenNodeIds.has(targetEntity.id)) {
            let typeMap = parentToTypeLeaves.get(s);
            if (!typeMap) parentToTypeLeaves.set(s, (typeMap = new Map()));
            const list = typeMap.get(targetEntity.type) || [];
            list.push(targetEntity);
            typeMap.set(targetEntity.type, list);
          }
        }
      });

      parentToTypeLeaves.forEach((typeMap, parentId) => {
        typeMap.forEach((leafEntities, type) => {
          if (leafEntities.length < 3) return;
          const collectionId = `coll-${parentId}-${type}`;
          leafEntities.forEach((l) => clusteredLeafIds.add(l.id));
          const color = graphNodeColor(type);
          const savedPos = initialPositions?.[collectionId];
          collectionNodes.push({
            group: 'nodes' as const,
            data: {
              id: collectionId,
              label: `${leafEntities.length} × ${getEntityTypeLabel(type)}`,
              type,
              color,
              nodeSize: 16,
              degree: leafEntities.length,
              isCollection: true,
              collectionCount: leafEntities.length,
              collectionLeaves: leafEntities.map((e) => e.name).join(', '),
            },
            position: savedPos ? { x: savedPos.x, y: savedPos.y } : undefined,
          });
          collectionEdges.push({
            group: 'edges' as const,
            data: {
              id: `edge-${collectionId}`,
              source: parentId,
              target: collectionId,
              label: `contains (${leafEntities.length})`,
              status: 'confirmed',
              verified: true,
              color: GRAPH_EDGE_COLORS.confirmed,
              lineStyle: 'dashed',
              directed: false,
            },
          });
        });
      });
    }

    const entityNodes = projectData.entities
      .filter((e) => selectedEntityTypes.has(e.type) && !hiddenNodeIds.has(e.id) && !clusteredLeafIds.has(e.id))
      .map((entity) => {
        const savedPos = initialPositions?.[entity.id];
        const photo = entity.attributes?.photo || entity.attributes?.image || entity.attributes?.avatar;
        const deg = degreeMap.get(entity.id) || 0;
        return {
          group: 'nodes' as const,
          data: {
            id: entity.id,
            label: entity.name,
            type: entity.type,
            color: graphNodeColor(entity.type),
            nodeSize: sizeFor(deg),
            degree: deg,
            imageUrl: photo || undefined,
            aliases: entity.aliases ? entity.aliases.join(', ') : '',
            isNote: false,
          },
          position: savedPos ? { x: savedPos.x, y: savedPos.y } : undefined,
        };
      });

    const noteNodes =
      showNotesOnGraph && projectData.notes
        ? projectData.notes
            .filter((n) => !hiddenNodeIds.has(n.id))
            .map((note) => {
              const savedPos = initialPositions?.[note.id];
              const noteDeg = degreeMap.get(note.id) || 0;
              return {
                group: 'nodes' as const,
                data: {
                  id: note.id,
                  label: note.title,
                  type: 'note',
                  color: GRAPH_NODE_COLORS.note,
                  nodeSize: Math.max(10, sizeFor(noteDeg) - 2),
                  degree: noteDeg,
                  isNote: true,
                  aliases: '',
                },
                position: savedPos ? { x: savedPos.x, y: savedPos.y } : undefined,
              };
            })
        : [];

    const allNodes = [...entityNodes, ...collectionNodes, ...noteNodes];
    const activeNodeIds = new Set(allNodes.map((n) => n.data.id));

    const entityEdges = (projectData.relationships || [])
      .filter((rel) => {
        const s = relSrc(rel);
        const t = relTgt(rel);
        return activeNodeIds.has(s) && activeNodeIds.has(t) && (!rel.status || selectedStatuses.has(rel.status));
      })
      .map((rel) => {
        const status: RelationshipStatus = rel.status || 'confirmed';
        return {
          group: 'edges' as const,
          data: {
            id: rel.id,
            source: relSrc(rel),
            target: relTgt(rel),
            label: rel.type || '',
            status,
            verified: status === 'confirmed' || status === 'supported',
            color: GRAPH_EDGE_COLORS[status] ?? GRAPH_EDGE_COLORS.confirmed,
            lineStyle: GRAPH_EDGE_STYLE[status] ?? 'solid',
            directed: rel.directed !== false,
            confidence: rel.confidence,
          },
        };
      });

    // Note Wikilink Mentions Edges
    const noteEdges: any[] = [];
    if (showNotesOnGraph && projectData.notes) {
      projectData.notes.forEach((note) => {
        if (!activeNodeIds.has(note.id)) return;
        const noteBody = note.markdownBody || (note as any).raw || '';
        const matches = Array.from(noteBody.matchAll(/\[\[(.*?)\]\]/g));
        matches.forEach((m: any, idx) => {
          const key = m[1].trim();
          const targetEntity = entityById.get(key) || entityByName.get(key.toLowerCase());
          if (targetEntity && activeNodeIds.has(targetEntity.id)) {
            noteEdges.push({
              group: 'edges' as const,
              data: {
                id: `rel-note-${note.id}-${targetEntity.id}-${idx}`,
                source: note.id,
                target: targetEntity.id,
                label: 'mentions',
                status: 'confirmed',
                verified: false,
                color: GRAPH_EDGE_COLORS.candidate,
                lineStyle: 'dotted',
                directed: false,
              },
            });
          }
        });
      });
    }

    return [...allNodes, ...entityEdges, ...collectionEdges, ...noteEdges];
  }, [
    projectData.entities,
    projectData.relationships,
    projectData.notes,
    selectedEntityTypes,
    selectedStatuses,
    hiddenNodeIds,
    showNotesOnGraph,
    initialPositions,
    sizeByDegree,
    clusterLeaves,
  ]);

  const graphSearchRef = useRef<HTMLInputElement>(null);
  const hiddenFilterCount =
    ENTITY_TYPES.length - selectedEntityTypes.size + (RELATIONSHIP_STATUSES.length - selectedStatuses.size);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    projectData.entities.forEach((e) => m.set(e.type, (m.get(e.type) || 0) + 1));
    return m;
  }, [projectData.entities]);
  const visibleCounts = useMemo(() => {
    let nodes = 0;
    let edges = 0;
    elements.forEach((el) => (el.group === 'nodes' ? nodes++ : edges++));
    return { nodes, edges };
  }, [elements]);

  // Workspace keyboard shortcuts (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return; // graph tab not visible
      if (e.key === '/') {
        e.preventDefault();
        graphSearchRef.current?.focus();
      } else if (e.key === 'f' || e.key === 'F') {
        cyRef.current?.fit(undefined, 30);
      } else if (e.key === 'l' || e.key === 'L') {
        runLayout(layoutNameRef.current);
      } else if (e.key === 'n' || e.key === 'N') {
        callbacksRef.current && onCreateEntity();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'ellipse',
            'background-color': 'data(color)',
            'background-opacity': 0.92,
            'border-width': 0,
            'label': '',
            'color': '#b4b8c0',
            'font-size': 9,
            'font-family': 'Inter, system-ui, sans-serif',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'text-wrap': 'ellipsis',
            'text-max-width': '140px',
            'text-background-color': '#0b0b0e',
            'text-background-opacity': 0.72,
            'text-background-padding': '1.5px',
            'text-background-shape': 'roundrectangle',
            'min-zoomed-font-size': 6,
            'width': 'data(nodeSize)' as any,
            'height': 'data(nodeSize)' as any,
            'overlay-opacity': 0,
            'underlay-opacity': 0,
            'z-index': 10,
          },
        },
        // LOD-controlled label visibility
        {
          selector: 'node.label-on',
          style: { 'label': 'data(label)' },
        },
        {
          selector: 'node[degree >= 6]',
          style: { 'z-index': 20, 'color': '#d0d3d9' },
        },
        {
          selector: 'node[imageUrl]',
          style: {
            'background-image': 'data(imageUrl)',
            'background-fit': 'cover',
            'background-clip': 'node',
            'background-opacity': 1,
            'border-width': 1,
            'border-color': 'data(color)',
          },
        },
        {
          selector: 'node[?isCollection]',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#1a1a20',
            'border-width': 1,
            'border-style': 'dashed',
            'border-color': 'data(color)',
            'border-opacity': 0.8,
          },
        },
        {
          selector: 'node[?isNote]',
          style: {
            'shape': 'round-rectangle',
            'background-color': 'data(color)',
            'background-opacity': 0.7,
          },
        },
        {
          selector: 'node.transform-running',
          style: {
            'underlay-color': '#c9a24a',
            'underlay-padding': 6,
            'underlay-opacity': 0.35,
            'underlay-shape': 'ellipse',
          },
        },
        {
          selector: 'node.hovered',
          style: {
            'label': 'data(label)',
            'background-opacity': 1,
            'border-width': 1.5,
            'border-color': '#d4d7dd',
            'border-opacity': 0.9,
            'color': '#f1f2f4',
            'z-index': 9999,
          },
        },
        {
          selector: 'node.hovered-neighbor',
          style: { 'background-opacity': 1, 'z-index': 500 },
        },
        {
          selector: 'node:selected',
          style: {
            'label': 'data(label)',
            'background-opacity': 1,
            'border-width': 2,
            'border-color': GRAPH_SELECT,
            'border-opacity': 1,
            'underlay-color': GRAPH_SELECT,
            'underlay-padding': 4,
            'underlay-opacity': 0.12,
            'underlay-shape': 'ellipse',
            'color': '#ffffff',
            'font-weight': 600 as any,
            'z-index': 10000,
          },
        },
        {
          selector: 'node.connecting-source',
          style: { 'border-width': 2, 'border-color': '#a99bd6', 'z-index': 99999 },
        },
        {
          selector: 'node.connecting-target',
          style: { 'border-width': 2, 'border-color': '#7fb79a', 'z-index': 99999 },
        },
        {
          selector: 'edge',
          style: {
            'width': 0.8,
            'line-color': 'data(color)',
            'line-opacity': 0.4,
            'curve-style': 'haystack',
            'haystack-radius': 0,
            'label': '',
            'font-size': 8,
            'font-family': 'Inter, system-ui, sans-serif',
            'color': '#9ea3ab',
            'text-rotation': 'autorotate',
            'text-background-opacity': 0.8,
            'text-background-color': '#0b0b0e',
            'text-background-padding': '1.5px',
            'text-background-shape': 'roundrectangle',
            'min-zoomed-font-size': 7,
            'z-index': 1,
          },
        },
        // Unverified relationships: thinner, fainter, broken line
        {
          selector: 'edge[!verified]',
          style: { 'line-opacity': 0.22, 'width': 0.7 },
        },
        { selector: 'edge[lineStyle = "dashed"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 3] } },
        { selector: 'edge[lineStyle = "dotted"]', style: { 'line-style': 'dotted' } },
        { selector: 'edge[status = "rejected"]', style: { 'line-opacity': 0.18 } },
        // Emphasised edges (hover / selection neighbourhood / zoomed-in labels)
        {
          selector: 'edge.emph',
          style: {
            'curve-style': 'bezier',
            'width': 1.3,
            'line-opacity': 0.85,
            'z-index': 600,
          },
        },
        {
          selector: 'edge.emph[?directed]',
          style: {
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(color)',
            'arrow-scale': 0.55,
          },
        },
        {
          selector: 'edge.edge-label-on',
          style: { 'label': 'data(label)' },
        },
        {
          selector: 'edge.hovered-connected',
          style: {
            'curve-style': 'bezier',
            'width': 1.4,
            'line-opacity': 0.9,
            'label': 'data(label)',
            'color': '#d4d7dd',
            'z-index': 800,
          },
        },
        {
          selector: 'edge.hovered-connected[?directed]',
          style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'arrow-scale': 0.6 },
        },
        {
          selector: 'edge:selected',
          style: {
            'curve-style': 'bezier',
            'width': 1.8,
            'line-color': GRAPH_SELECT,
            'line-opacity': 1,
            'label': 'data(label)',
            'color': '#ffffff',
            'target-arrow-color': GRAPH_SELECT,
            'z-index': 900,
          },
        },
        {
          selector: 'edge:selected[?directed]',
          style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7 },
        },
        // Context dimming: selection neighbourhood
        {
          selector: 'node.dimmed',
          style: { 'opacity': 0.22 },
        },
        {
          selector: 'edge.dimmed',
          style: { 'opacity': 0.12 },
        },
        // Focus / search fading (stronger)
        {
          selector: '.faded',
          style: { 'opacity': 0.08, 'text-opacity': 0 },
        },
        {
          selector: 'node.highlighted',
          style: { 'opacity': 1, 'label': 'data(label)' },
        },
        {
          selector: 'edge.highlighted',
          style: { 'opacity': 1, 'line-opacity': 0.8, 'curve-style': 'bezier' },
        },
      ],
      layout: { name: 'preset' },
      minZoom: 0.05,
      maxZoom: 4,
      wheelSensitivity: 0.25,
      textureOnViewport: false,
      hideEdgesOnViewport: false,
      pixelRatio: 'auto',
    });

    cyRef.current = cy;

    // Connection drag from node (Key C / Alt / Option / Connect Mode)
    cy.on('tapstart mousedown', 'node', (evt: EventObject) => {
      const orig = evt.originalEvent as MouseEvent | TouchEvent | undefined;
      const hasAltKey = !!(orig && 'altKey' in orig && orig.altKey);
      const isCKey = isConnectKeyPressedRef.current;
      const isConnectMode = isConnectModeActiveRef.current;

      const shouldConnect = isCKey || hasAltKey || isConnectMode;
      if (!shouldConnect) return;

      const node = evt.target;
      if (node.data('isNote')) return;

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const rpos = node.renderedPosition();

      let mouseX = rect.left + rpos.x;
      let mouseY = rect.top + rpos.y;
      if (orig && 'clientX' in orig) {
        mouseX = (orig as MouseEvent).clientX;
        mouseY = (orig as MouseEvent).clientY;
      }

      const entity = projectData.entities.find((e) => e.id === node.id());
      startConnectionDrag(
        node.id(),
        entity ? entity.name : node.id(),
        (entity?.type || 'custom') as EntityType,
        rect.left + rpos.x,
        rect.top + rpos.y,
        mouseX,
        mouseY
      );
    });

    // Interactive physics simulation on node drag (nodes bounce and repel each other)
    cy.on('drag', 'node', (evt: EventObject) => {
      if (connectionDragRef.current) {
        const node = evt.target;
        if (node.id() === connectionDragRef.current.sourceId && sourceNodeInitialPosRef.current) {
          node.position(sourceNodeInitialPosRef.current);
        }
        return;
      }
      const draggedNode = evt.target;

      // Update hover tooltip position if dragging the hovered node
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const rpos = draggedNode.renderedPosition();
        setHoveredNode({
          id: draggedNode.id(),
          x: rect.left + rpos.x,
          y: rect.top + rpos.y,
          isNote: draggedNode.data('isNote'),
        });
      }
    });

    // Hover handlers for nodes
    cy.on('mouseover', 'node', (evt: EventObject) => {
      const node = evt.target;
      const nodeId = node.id();
      const isNote = node.data('isNote');

      cy.elements().removeClass('hovered hovered-connected hovered-neighbor');

      cy.batch(() => {
        node.addClass('hovered');
        node.connectedEdges().addClass('hovered-connected');
        node.neighborhood('node').addClass('hovered-neighbor label-on');
      });

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const rpos = node.renderedPosition();
        setHoveredNode({
          id: nodeId,
          x: rect.left + rpos.x,
          y: rect.top + rpos.y,
          isNote,
        });
      }
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('hovered hovered-connected hovered-neighbor');
      setHoveredNode(null);
      scheduleLabelUpdate();
    });

    // Hover handlers for edges
    cy.on('mouseover', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      edge.addClass('hovered-connected');
    });

    cy.on('mouseout', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      edge.removeClass('hovered-connected');
    });

    cy.on('pan zoom', () => {
      setHoveredNode(null);
    });

    // Selection handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      if (!node.data('isNote')) {
        callbacksRef.current.onSelectEntity(node.id());
      }
      setContextMenu((prev) => ({ ...prev, visible: false }));
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      callbacksRef.current.onSelectRelationship(edge.id());
      setContextMenu((prev) => ({ ...prev, visible: false }));
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        if (callbacksRef.current.focusedNodeId) {
          callbacksRef.current.clearFocus();
        }
      }
    });

    // Double-click to open
    cy.on('dbltap', 'node', (evt: EventObject) => {
      const node = evt.target;
      if (node.data('isNote')) {
        callbacksRef.current.onOpenNote?.(node.id());
      } else {
        callbacksRef.current.onOpenEntity(node.id());
      }
    });

    cy.on('dbltap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      callbacksRef.current.onOpenRelationship(edge.id());
    });

    // Custom Context menu handlers
    cy.on('cxttap', 'node', (evt: EventObject) => {
      evt.originalEvent?.preventDefault();
      const node = evt.target;
      const originalEvt = evt.originalEvent as MouseEvent | undefined;
      const pos = evt.renderedPosition;
      let x = pos.x;
      let y = pos.y;
      if (originalEvt && typeof originalEvt.clientX === 'number') {
        x = originalEvt.clientX;
        y = originalEvt.clientY;
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        x = rect.left + pos.x;
        y = rect.top + pos.y;
      }

      setContextMenu({
        visible: true,
        x,
        y,
        targetType: 'node',
        targetId: node.id(),
        isNote: node.data('isNote'),
      });
      setHoveredNode(null);
    });

    cy.on('cxttap', 'edge', (evt: EventObject) => {
      evt.originalEvent?.preventDefault();
      const edge = evt.target;
      const originalEvt = evt.originalEvent as MouseEvent | undefined;
      const pos = evt.renderedPosition;
      let x = pos.x;
      let y = pos.y;
      if (originalEvt && typeof originalEvt.clientX === 'number') {
        x = originalEvt.clientX;
        y = originalEvt.clientY;
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        x = rect.left + pos.x;
        y = rect.top + pos.y;
      }

      setContextMenu({
        visible: true,
        x,
        y,
        targetType: 'edge',
        targetId: edge.id(),
      });
      setHoveredNode(null);
    });

    cy.on('cxttap', (evt: EventObject) => {
      if (evt.target === cy) {
        evt.originalEvent?.preventDefault();
        const originalEvt = evt.originalEvent as MouseEvent | undefined;
        const pos = evt.renderedPosition;
        let x = pos.x;
        let y = pos.y;
        if (originalEvt && typeof originalEvt.clientX === 'number') {
          x = originalEvt.clientX;
          y = originalEvt.clientY;
        } else if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          x = rect.left + pos.x;
          y = rect.top + pos.y;
        }

        setContextMenu({
          visible: true,
          x,
          y,
          targetType: 'background',
        });
        setHoveredNode(null);
      }
    });

    return () => {
      if (activeLayoutRef.current) {
        try {
          activeLayoutRef.current.stop();
        } catch (e) {}
        activeLayoutRef.current = null;
      }
      try {
        cy.stop();
      } catch (e) {}
      try {
        cy.destroy();
      } catch (e) {}
      cyRef.current = null;
    };
  }, []);

  // Sync elements into Cytoscape incrementally (diff instead of teardown so
  // existing node positions, selection and viewport survive data changes).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    const nextIds = new Set<string>();
    elements.forEach((el) => nextIds.add(el.data.id));
    const added: any[] = [];

    cy.batch(() => {
      cy.elements().forEach((ele) => {
        if (!nextIds.has(ele.id())) ele.remove();
      });
      elements.forEach((el) => {
        const existing = cy.getElementById(el.data.id);
        if (existing.nonempty()) {
          if (
            el.group === 'edges' &&
            (existing.data('source') !== el.data.source || existing.data('target') !== el.data.target)
          ) {
            existing.remove();
            added.push(el);
          } else {
            existing.data(el.data);
          }
        } else {
          added.push(el);
        }
      });
      if (added.length) {
        // nodes before edges
        cy.add(added.filter((e) => e.group === 'nodes'));
        cy.add(added.filter((e) => e.group === 'edges'));
      }
    });

    const newNodes = added.filter((e) => e.group === 'nodes');
    const unpositioned = newNodes.filter((e) => !e.position);
    if (unpositioned.length > 0) {
      const total = cy.nodes().length;
      // Incremental: pin existing nodes and only settle newcomers, unless the
      // graph is mostly new (initial load) — then lay out everything.
      const incremental = total - unpositioned.length >= Math.max(3, unpositioned.length);
      const unposIds = new Set(unpositioned.map((e) => e.data.id));
      runLayout(layoutNameRef.current, {
        pinIds: incremental ? cy.nodes().filter((n) => !unposIds.has(n.id())).map((n) => n.id()) : undefined,
        fit: !isInitialFitDoneRef.current || !incremental,
      });
      isInitialFitDoneRef.current = true;
    } else if (!isInitialFitDoneRef.current && elements.length > 0) {
      try {
        cy.fit(undefined, 30);
        isInitialFitDoneRef.current = true;
      } catch (e) {}
    }
    scheduleLabelUpdate();
  }, [elements]);

  // ---- Label level-of-detail -------------------------------------------
  const labelRafRef = useRef<number | null>(null);
  const labelFontRef = useRef<number>(0);
  const baseStyleRef = useRef<any[] | null>(null);
  const edgeLabelsRef = useRef<boolean>(showEdgeLabels);
  useEffect(() => {
    edgeLabelsRef.current = showEdgeLabels;
  });
  const updateLabels = () => {
    labelRafRef.current = null;
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const zoom = cy.zoom();
    const w = cy.width();
    const h = cy.height();
    const selected = cy.$('node:selected');
    const selNeighborhood = selected.closedNeighborhood();
    const forcedIds = new Set<string>();
    selNeighborhood.nodes().forEach((n) => {
      forcedIds.add(n.id());
    });
    cy.$('node.highlighted').forEach((n) => {
      forcedIds.add(n.id());
    });

    const candidates: LabelCandidate[] = [];
    cy.nodes().forEach((n) => {
      if (n.hasClass('faded') || n.hasClass('dimmed')) return;
      const label = n.data('label');
      if (!label) return;
      const rp = n.renderedPosition();
      const deg = n.data('degree') || 0;
      // Selection neighbourhood / search hits go first, but still respect collisions.
      const boosted = forcedIds.has(n.id());
      candidates.push({
        id: n.id(),
        x: rp.x,
        y: rp.y,
        r: (n.data('nodeSize') || 10) * zoom * 0.5,
        label,
        priority: deg + (n.data('isCollection') ? 2 : 0) + (boosted ? 10000 : 0),
        forced: n.selected() || n.hasClass('hovered'),
      });
    });
    const visible = selectVisibleLabels(candidates, {
      zoom,
      fontPx: 10.5,
      viewW: w,
      viewH: h,
    });

    // Keep label text at a constant, small on-screen size regardless of zoom.
    // Quantise zoom (~19% steps) so restyling happens rarely.
    const zq = Math.pow(2, Math.round(Math.log2(zoom) * 4) / 4);
    const fontBucket = Math.round(Math.min(80, Math.max(4, 10.5 / zq)) * 100) / 100;
    if (fontBucket !== labelFontRef.current) {
      labelFontRef.current = fontBucket;
      if (!baseStyleRef.current) baseStyleRef.current = (cy.style() as any).json();
      (cy.style() as any)
        .fromJson([
          ...(baseStyleRef.current || []),
          { selector: 'node', style: { 'font-size': fontBucket, 'text-margin-y': Math.max(1.5, 3 / zq), 'text-max-width': `${Math.round(170 * (fontBucket / 10.5))}px`, 'text-background-padding': `${Math.max(1.5, 2 / zq)}px` } },
          { selector: 'edge', style: { 'font-size': fontBucket * 0.85, 'width': Math.max(0.8, 0.7 / zq) } },
          { selector: 'edge.emph, edge.hovered-connected', style: { 'width': Math.max(1.3, 1.2 / zq) } },
          { selector: 'edge:selected', style: { 'width': Math.max(1.8, 1.6 / zq) } },
        ])
        .update();
    }

    const showEdgeLabelsZoomed = edgeLabelsRef.current && zoom >= 1.3;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const on = visible.has(n.id());
        if (on !== n.hasClass('label-on')) n.toggleClass('label-on', on);
      });
      // Edges: emphasise selection neighbourhood; labels only where useful.
      const selEdges = selected.connectedEdges();
      cy.edges().forEach((e) => {
        const isSel = selEdges.contains(e);
        const emph = isSel || (zoom >= 1.6 && !e.hasClass('dimmed'));
        if (emph !== e.hasClass('emph')) e.toggleClass('emph', emph);
        const lbl = (isSel && selected.length === 1 && zoom >= 0.6) || (showEdgeLabelsZoomed && !e.hasClass('dimmed') && !e.hasClass('faded') && visible.has(e.source().id()) && visible.has(e.target().id()));
        if (lbl !== e.hasClass('edge-label-on')) e.toggleClass('edge-label-on', lbl);
      });
    });
  };
  const scheduleLabelUpdate = () => {
    if (labelRafRef.current != null) return;
    labelRafRef.current = requestAnimationFrame(updateLabels);
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    // throttle viewport-driven updates (labels recompute after pan/zoom settles a frame)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onViewport = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scheduleLabelUpdate, cy.nodes().length > 600 ? 90 : 16);
    };
    const onFree = () => scheduleLabelUpdate();
    // Never blow small graphs up to giant circles when fitting.
    const MAX_FIT_ZOOM = 1.8;
    const origFit = cy.fit.bind(cy);
    (cy as any).fit = (eles?: any, padding?: number) => {
      origFit(eles, padding);
      if (cy.zoom() > MAX_FIT_ZOOM) {
        const bb = (eles && eles.length ? eles : cy.elements()).boundingBox();
        cy.zoom(MAX_FIT_ZOOM);
        cy.pan({
          x: cy.width() / 2 - MAX_FIT_ZOOM * (bb.x1 + bb.w / 2),
          y: cy.height() / 2 - MAX_FIT_ZOOM * (bb.y1 + bb.h / 2),
        });
      }
      return cy;
    };
    cy.on('viewport', onViewport);
    cy.on('free position', 'node', onFree);
    cy.on('select unselect', onFree);
    return () => {
      if (timer) clearTimeout(timer);
      if (labelRafRef.current != null) cancelAnimationFrame(labelRafRef.current);
      labelRafRef.current = null;
      cy.off('viewport', onViewport);
      cy.off('free position', 'node', onFree);
      cy.off('select unselect', onFree);
    };
  }, []);

  useEffect(() => {
    scheduleLabelUpdate();
  }, [showEdgeLabels]);

  // Sync active selection from props + neighbourhood emphasis
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    cy.batch(() => {
      cy.elements().unselect();
      cy.elements().removeClass('dimmed');
      if (selectedEntityId) {
        const node = cy.getElementById(selectedEntityId);
        if (node.nonempty()) {
          node.select();
          const hood = node.closedNeighborhood();
          cy.elements().difference(hood).addClass('dimmed');
        }
      } else if (selectedRelationshipId) {
        const edge = cy.getElementById(selectedRelationshipId);
        if (edge.nonempty()) {
          edge.select();
          const hood = edge.union(edge.connectedNodes());
          cy.elements().difference(hood).addClass('dimmed');
        }
      }
    });
    scheduleLabelUpdate();
  }, [selectedEntityId, selectedRelationshipId, elements]);

  const layoutNameRef = useRef<string>(layoutName);
  useEffect(() => {
    layoutNameRef.current = layoutName;
  });

  /** Run the selected layout. `force` uses the in-house ForceAtlas2 engine. */
  const runLayout = (name: string, opts: { pinIds?: string[]; fit?: boolean } = {}) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    if (activeLayoutRef.current) {
      try {
        activeLayoutRef.current.stop();
      } catch (e) {}
      activeLayoutRef.current = null;
    }

    const fit = opts.fit !== false;
    const nodeCount = cy.nodes().length;
    const animate = nodeCount <= 400;

    if (name === 'force' || name === 'cose') {
      const pin = new Set(opts.pinIds || []);
      const lnodes: LayoutNode[] = cy.nodes().map((n) => {
        const p = n.position();
        const isPinned = pin.has(n.id());
        return {
          id: n.id(),
          // When re-running from scratch, still start from current positions
          // so the result stays recognisable (stable layouts).
          x: isPinned || pin.size === 0 ? p.x : undefined,
          y: isPinned || pin.size === 0 ? p.y : undefined,
          size: (n.data('nodeSize') || 10) / 2,
          fixed: isPinned,
        };
      });
      // Fresh layout from scratch when the graph has never been placed (all at origin)
      if (pin.size === 0) {
        const allOrigin = lnodes.every((n) => Math.abs(n.x || 0) < 1e-6 && Math.abs(n.y || 0) < 1e-6);
        if (allOrigin) lnodes.forEach((n) => { n.x = undefined; n.y = undefined; });
      }
      const ledges: LayoutEdge[] = cy.edges().map((e) => ({
        source: e.source().id(),
        target: e.target().id(),
        weight: e.data('verified') === false ? 0.6 : 1,
      }));
      const positions = computeForceLayout(lnodes, ledges, {
        iterations: pin.size > 0 ? Math.min(150, defaultIterations(nodeCount)) : undefined,
      });
      const layout = cy.layout({
        name: 'preset',
        positions: (node: any) => positions[node.id()],
        animate,
        animationDuration: 380,
        animationEasing: 'ease-out-cubic',
        fit: false,
      } as any);
      activeLayoutRef.current = layout;
      layout.on('layoutstop', () => {
        if (activeLayoutRef.current === layout) activeLayoutRef.current = null;
        if (fit) cy.fit(undefined, 30);
        scheduleLabelUpdate();
      });
      layout.run();
      return;
    }

    let layoutOptions: any = { name, animate, animationDuration: 380, fit, padding: 30 };
    if (name === 'concentric') {
      layoutOptions = {
        ...layoutOptions,
        minNodeSpacing: 14,
        avoidOverlap: true,
        equidistant: false,
        concentric: (node: any) => node.degree(),
        levelWidth: () => 2,
      };
    } else if (name === 'breadthfirst') {
      layoutOptions = { ...layoutOptions, directed: true, spacingFactor: 0.9, avoidOverlap: true };
    } else if (name === 'grid') {
      layoutOptions = { ...layoutOptions, spacingFactor: 0.7, avoidOverlap: true };
    }

    try {
      const layout = cy.layout(layoutOptions);
      activeLayoutRef.current = layout;
      layout.on('layoutstop', () => {
        if (activeLayoutRef.current === layout) activeLayoutRef.current = null;
        scheduleLabelUpdate();
      });
      layout.run();
    } catch (e) {
      console.warn('Layout execution error:', e);
    }
  };

  // Execute Maltego OSINT Transform
  const handleExecuteTransform = async (
    targetEntity: Entity,
    transform: TransformDefinition
  ) => {
    const cy = cyRef.current;
    setIsRunningTransform(true);
    setActiveRunningTransform({
      name: transform.name,
      entityName: targetEntity.name,
      entityId: targetEntity.id,
    });

    const startTime = Date.now();
    const logId = `log-${Date.now().toString(36)}`;

    // Add running log
    const initialEntry: TransformLogEntry = {
      id: logId,
      timestamp: new Date().toLocaleTimeString(),
      transformId: transform.id,
      transformName: transform.name,
      entityName: targetEntity.name,
      entityType: targetEntity.type,
      status: 'running',
      message: `Executing "${transform.name}"...`,
    };

    setTransformLogs((prev) => [initialEntry, ...prev]);

    // Add glowing radar indicator to node
    if (cy && !cy.destroyed()) {
      cy.getElementById(targetEntity.id).addClass('transform-running');
    }

    try {
      const result = await transform.run(targetEntity, {
        allEntities: projectData.entities,
        log: (msg) => {
          setTransformLogs((prev) =>
            prev.map((l) => (l.id === logId ? { ...l, message: msg } : l))
          );
        },
      });

      const durationMs = Date.now() - startTime;

      // Calculate radial coordinates around parent node
      const parentPos = initialPositions?.[targetEntity.id] ||
        (cy ? cy.getElementById(targetEntity.id).position() : { x: 300, y: 300 });

      const newPositions: Record<string, { x: number; y: number }> = {};
      const newEntitiesWithPos = result.newEntities.map((ent, idx) => {
        const total = result.newEntities.length || 1;
        const angle = (idx / total) * 2 * Math.PI + 0.2;
        const radius = 130 + (idx % 2) * 45;
        const pos = {
          x: Math.round(parentPos.x + Math.cos(angle) * radius),
          y: Math.round(parentPos.y + Math.sin(angle) * radius),
        };
        const entId = `ent-${Date.now().toString(36)}-${idx}`;
        newPositions[entId] = pos;
        return {
          ...ent,
          id: entId,
          position: pos,
        };
      });

      const newRels = result.newRelationships.map((r) => ({
        source_entity: targetEntity.id,
        target_entity: r.targetEntityName,
        type: r.type,
        status: r.status || 'confirmed',
        confidence: r.confidence ?? 1.0,
        evidence: r.evidence || [`Discovered via ${transform.name}`],
      }));

      if (onBatchAddEntitiesAndRelationships) {
        await onBatchAddEntitiesAndRelationships(newEntitiesWithPos, newRels, newPositions);
      }

      const logMsg =
        result.logs.length > 0
          ? result.logs.join(' • ')
          : `Discovered ${result.newEntities.length} entities and ${result.newRelationships.length} relationships`;

      setTransformLogs((prev) =>
        prev.map((l) =>
          l.id === logId
            ? {
                ...l,
                status: 'success',
                message: logMsg,
                entitiesAdded: result.newEntities.length,
                relationshipsAdded: result.newRelationships.length,
                durationMs,
              }
            : l
        )
      );

      showToast(`Transform complete: +${result.newEntities.length} entities discovered`);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || String(err);

      setTransformLogs((prev) =>
        prev.map((l) =>
          l.id === logId
            ? {
                ...l,
                status: 'error',
                message: `Failed: ${errorMsg}`,
                durationMs,
              }
            : l
        )
      );

      showToast(`Transform error: ${errorMsg}`);
    } finally {
      setIsRunningTransform(false);
      setActiveRunningTransform(null);
      if (cy && !cy.destroyed()) {
        cy.getElementById(targetEntity.id).removeClass('transform-running');
      }
    }
  };

  // Maltego Selection Helpers
  const selectNeighbors = (nodeId: string, direction: 'all' | 'in' | 'out' = 'all') => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;

    cy.elements().unselect();
    node.select();

    if (direction === 'all') {
      node.neighborhood().select();
    } else if (direction === 'in') {
      node.incomers().select();
    } else if (direction === 'out') {
      node.outgoers().select();
    }
    showToast(`Selected neighbors (${direction})`);
  };

  const selectByType = (entityType: string) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.elements().unselect();
    const matched = cy.nodes(`[type = "${entityType}"]`);
    matched.select();
    showToast(`Selected ${matched.length} ${entityType} node(s)`);
  };

  const invertSelection = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const unselectedNodes = cy.nodes(':unselected');
    cy.nodes(':selected').unselect();
    unselectedNodes.select();
    showToast(`Inverted selection: ${unselectedNodes.length} nodes selected`);
  };

  const findShortestPathBetweenSelected = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const selected = cy.nodes(':selected');
    if (selected.length < 2) {
      showToast('Select at least 2 nodes to find shortest path (Cmd/Ctrl + Click)');
      return;
    }
    const aStar = cy.elements().aStar({
      root: selected[0],
      goal: selected[1],
      directed: false,
    });
    if (aStar.found) {
      cy.elements().unselect();
      aStar.path.select();
      showToast(`Shortest path found: ${aStar.distance} hops`);
    } else {
      showToast('No path exists between selected nodes');
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/trace-entity-type') as EntityType;
    if (type && containerRef.current && cyRef.current) {
      e.preventDefault();
      const containerRect = containerRef.current.getBoundingClientRect();
      const cy = cyRef.current;
      const pan = cy.pan();
      const zoom = cy.zoom();
      const canvasX = Math.round((e.clientX - containerRect.left - pan.x) / zoom);
      const canvasY = Math.round((e.clientY - containerRect.top - pan.y) / zoom);

      setDroppedEntityPrompt({
        isOpen: true,
        type,
        position: { x: canvasX, y: canvasY },
        screenX: e.clientX,
        screenY: e.clientY,
      });
      setDroppedEntityName('');
    }
  };

  const handlePaletteSelectType = (type: EntityType) => {
    const cy = cyRef.current;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const pan = cy ? cy.pan() : { x: 0, y: 0 };
    const zoom = cy ? cy.zoom() : 1;
    const width = containerRect?.width || 800;
    const height = containerRect?.height || 600;
    const canvasX = Math.round((width / 2 - pan.x) / zoom);
    const canvasY = Math.round((height / 2 - pan.y) / zoom);
    setDroppedEntityPrompt({
      isOpen: true,
      type,
      position: { x: canvasX, y: canvasY },
      screenX: width / 2,
      screenY: height / 2,
    });
    setDroppedEntityName('');
  };

  // Focus and Highlight Node + Direct Neighbors
  const focusNodeNeighborhood = (nodeId: string) => {
    const cy = cyRef.current;
    if (!cy) return;

    const targetNode = cy.getElementById(nodeId);
    if (targetNode.empty()) return;

    setFocusedNodeId(nodeId);
    const neighborhood = targetNode.neighborhood().add(targetNode);

    cy.elements().removeClass('highlighted faded');
    cy.elements().difference(neighborhood).addClass('faded');
    neighborhood.addClass('highlighted');

    cy.animate({
      fit: {
        eles: neighborhood,
        padding: 60,
      },
      duration: 350,
    });
  };

  const clearFocus = () => {
    const cy = cyRef.current;
    if (!cy) return;
    setFocusedNodeId(null);
    cy.elements().removeClass('highlighted faded');
  };

  // Keyboard-reachable node list. Cytoscape renders every node to a <canvas>, so without this
  // there is no DOM focus target for any node and no way to select, open or delete one without a
  // mouse. This is a screen-reader-only roving-tabindex proxy, not a visible control: sighted
  // keyboard users get their feedback from focusNodeNeighborhood's highlight-and-pan below.
  // No documented composite role (grid/tablist/combobox/listbox/tree/treegrid) matches a free
  // node-link graph exactly; listbox/option is the closest fit and makes no WCAG claim beyond that.
  const navigableNodes = useMemo(
    () =>
      elements
        .filter((el) => el.group === 'nodes')
        .map((el) => ({
          id: el.data.id as string,
          label: (el.data.label as string) || (el.data.id as string),
          isNote: Boolean(el.data.isNote),
        })),
    [elements]
  );
  const [keyboardFocusedNodeId, setKeyboardFocusedNodeId] = useState<string | null>(null);
  const nodeListRef = useRef<HTMLDivElement>(null);

  const handleNodeListFocus = (id: string) => {
    setKeyboardFocusedNodeId(id);
    focusNodeNeighborhood(id);
  };

  const handleNodeListKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, id: string, isNote: boolean) => {
    const directionKeys: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = directionKeys[e.key];
    if (direction) {
      // Never intercept a modified key or a transition the live geometry can't support; let the
      // browser scroll natively instead (spatial-navigation guidance).
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const cy = cyRef.current;
      if (!cy) return;
      const currentNode = cy.getElementById(id);
      if (currentNode.empty()) return;
      const box = currentNode.renderedBoundingBox();
      const candidates = cy.nodes().map((node) => {
        const b = node.renderedBoundingBox();
        return { id: node.id(), rect: { left: b.x1, right: b.x2, top: b.y1, bottom: b.y2 } };
      });
      const nextId = findSpatialCandidate(
        { id, rect: { left: box.x1, right: box.x2, top: box.y1, bottom: box.y2 } },
        candidates,
        direction
      );
      if (!nextId) return;
      e.preventDefault();
      nodeListRef.current?.querySelector<HTMLButtonElement>(`[data-node-option="${nextId}"]`)?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isNote) onOpenNote?.(id);
      else {
        onSelectEntity(id);
        onOpenEntity(id);
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (isNote) onDeleteNote?.(id);
      else onDeleteEntity(id);
    }
  };

  // Search in Graph
  const handleGraphSearch = (query: string) => {
    setSearchQuery(query);
    const cy = cyRef.current;
    if (!cy || !query.trim()) return;

    const lower = query.toLowerCase();
    const matched = cy.nodes().filter((node) => {
      const label = node.data('label') || '';
      const aliases = node.data('aliases') || '';
      return label.toLowerCase().includes(lower) || aliases.toLowerCase().includes(lower);
    });

    if (matched.nonempty()) {
      cy.elements().removeClass('highlighted faded');
      cy.elements().difference(matched).addClass('faded');
      matched.addClass('highlighted');
      cy.animate({
        fit: {
          eles: matched,
          padding: 80,
        },
        duration: 350,
      });
    }
  };

  // Save layout positions
  const handleSavePositions = () => {
    const cy = cyRef.current;
    if (!cy || !onSavePositions) return;

    const positions: Record<string, { x: number; y: number }> = {
      ...(initialPositions || {}),
    };
    cy.nodes().forEach((node) => {
      const pos = node.position();
      positions[node.id()] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    });

    onSavePositions(positions);
  };

  // Toggle filter
  const toggleEntityType = (type: EntityType) => {
    setSelectedEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleStatus = (status: RelationshipStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size > 1) next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className="relative w-full h-full flex flex-col select-none overflow-hidden" style={{ background: GRAPH_BG }}>
      {/* Graph toolbar (docked) */}
      <div className="h-[32px] shrink-0 flex items-center gap-0.5 px-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] z-20 relative min-w-0">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-zinc-600 absolute left-2 pointer-events-none" />
          <input
            ref={graphSearchRef}
            type="text"
            placeholder="Find in graph"
            value={searchQuery}
            onChange={(e) => handleGraphSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleGraphSearch('');
                clearFocus();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`t-input !pl-6 !pr-6 ${isNarrow ? '!w-32' : isCompact ? '!w-44' : isMedium ? '!w-56' : '!w-72'}`}
          />
          <span className="t-kbd absolute right-1.5 pointer-events-none">/</span>
        </div>

        <ToolSep />

        {isCompact ? (
          <select
            value={layoutName}
            onChange={(e) => {
              setLayoutName(e.target.value);
              runLayout(e.target.value);
            }}
            className="t-input !w-auto !pr-1 cursor-default"
            title="Layout"
          >
            <option value="force">Force</option>
            <option value="breadthfirst">Tree</option>
            <option value="concentric">Radial</option>
            <option value="grid">Grid</option>
          </select>
        ) : (
        <div className="flex items-stretch h-[24px] border border-[var(--t-border)] rounded-[3px] overflow-hidden" role="radiogroup" aria-label="Layout">
          {[
            { id: 'force', label: 'Force', title: 'Force-directed (ForceAtlas2)' },
            { id: 'breadthfirst', label: 'Tree', title: 'Hierarchical' },
            { id: 'concentric', label: 'Radial', title: 'Concentric by degree' },
            { id: 'grid', label: 'Grid', title: 'Grid' },
          ].map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layoutName === l.id}
              onClick={() => {
                setLayoutName(l.id);
                runLayout(l.id);
              }}
              className={`px-2 text-[11.5px] border-l border-[var(--t-border)] first:border-l-0 ${
                layoutName === l.id ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 hover:bg-[var(--t-hover)]'
              }`}
              title={l.title}
            >
              {l.label}
            </button>
          ))}
        </div>
        )}
        <button type="button" onClick={() => runLayout(layoutName)} className="t-icon-btn" title="Re-run layout  (L)">
          <RotateCcw />
        </button>
        <button type="button" onClick={() => cyRef.current?.fit(undefined, 30)} className="t-icon-btn" title="Fit to view  (F)">
          <Maximize2 />
        </button>

        <ToolSep />

        <button type="button" onClick={() => setShowEdgeLabels(!showEdgeLabels)} className="t-icon-btn" data-active={showEdgeLabels} title="Relationship labels when zoomed in">
          <Tag />
        </button>
        <button type="button" onClick={() => setShowNotesOnGraph(!showNotesOnGraph)} className="t-icon-btn" data-active={showNotesOnGraph} title="Show notes and their [[mentions]]">
          <FileText />
        </button>
        {!isNarrow && (
        <button type="button" onClick={() => setSizeByDegree(!sizeByDegree)} className="t-icon-btn" data-active={sizeByDegree} title="Size nodes by number of connections">
          <Activity />
        </button>
        )}
        {!isNarrow && (
        <button type="button" onClick={() => setClusterLeaves(!clusterLeaves)} className="t-icon-btn" data-active={clusterLeaves} title="Collapse leaf entities into collections">
          <Boxes />
        </button>
        )}
        <button
          type="button"
          onClick={toggleConnectMode}
          className="t-icon-btn"
          data-active={isConnectModeActive || isConnectKeyPressed}
          title="Connect mode: drag from one node to another  (hold C or ⌥)"
        >
          <GitFork />
        </button>

        <ToolSep />

        <div className="relative">
          <button
            type="button"
            onClick={() => setSelectionMenuOpen(!selectionMenuOpen)}
            className="t-btn !bg-transparent !border-transparent hover:!bg-[var(--t-hover)] !px-1.5"
            data-active={selectionMenuOpen}
            title="Selection tools"
          >
            <MousePointer className="w-3.5 h-3.5" />
            {!isMedium && <span>Select</span>}
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
          {selectionMenuOpen && (
            <div className="t-menu absolute top-full mt-1 left-0 z-40 w-52">
              <button
                type="button"
                className="t-menu-item"
                onClick={() => {
                  const sel = cyRef.current?.$(':selected');
                  if (sel && sel.nonempty()) {
                    sel.neighborhood().select();
                    showToast('Selected neighbours');
                  } else {
                    showToast('Select a node first');
                  }
                  setSelectionMenuOpen(false);
                }}
              >
                <Share2 />
                <span className="flex-1">Select neighbours</span>
              </button>
              <button type="button" className="t-menu-item" onClick={() => { invertSelection(); setSelectionMenuOpen(false); }}>
                <RotateCcw />
                <span className="flex-1">Invert selection</span>
              </button>
              <button type="button" className="t-menu-item" onClick={() => { findShortestPathBetweenSelected(); setSelectionMenuOpen(false); }}>
                <CircleDot />
                <span className="flex-1">Shortest path between 2</span>
              </button>
              <div className="t-menu-sep" />
              <button
                type="button"
                className="t-menu-item"
                onClick={() => {
                  cyRef.current?.elements().unselect();
                  setSelectionMenuOpen(false);
                }}
              >
                <X />
                <span className="flex-1">Deselect all</span>
                <span className="t-kbd !border-0 opacity-70">Esc</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            className="t-btn !bg-transparent !border-transparent hover:!bg-[var(--t-hover)] !px-1.5"
            title="Filter entity types and relationship statuses"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {!isMedium && <span>Filter</span>}
            {hiddenFilterCount > 0 && (
              <span className="font-mono text-[10px] text-[var(--t-accent-strong)] tabular-nums">{hiddenFilterCount}</span>
            )}
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
          {filterPanelOpen && (
            <div className="t-menu absolute top-full mt-1 left-0 z-40 w-60 !py-0 text-[12px]">
              <div className="h-[26px] flex items-center justify-between px-2.5 border-b border-[var(--t-border)]">
                <span className="t-label">Entity types</span>
                <button
                  type="button"
                  className="text-[11px] text-zinc-500 hover:text-zinc-200"
                  onClick={() => setSelectedEntityTypes(new Set(ENTITY_TYPES.map((t) => t.type)))}
                >
                  All
                </button>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                {ENTITY_TYPES.map((t) => {
                  const checked = selectedEntityTypes.has(t.type);
                  const n = typeCounts.get(t.type) || 0;
                  return (
                    <label key={t.type} className="flex items-center gap-2 px-2.5 h-[22px] hover:bg-[var(--t-hover)] cursor-default">
                      <input type="checkbox" checked={checked} onChange={() => toggleEntityType(t.type)} className="accent-[var(--t-accent)] w-3 h-3" />
                      <span className="t-swatch" style={{ background: t.color, opacity: checked ? 1 : 0.35 }} />
                      <span className={`flex-1 ${checked ? 'text-zinc-200' : 'text-zinc-600'}`}>{t.label}</span>
                      <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{n}</span>
                    </label>
                  );
                })}
              </div>
              <div className="h-[26px] flex items-center px-2.5 border-y border-[var(--t-border)]">
                <span className="t-label">Verification</span>
              </div>
              <div className="py-1">
                {RELATIONSHIP_STATUSES.map((s) => {
                  const checked = selectedStatuses.has(s.status);
                  return (
                    <label key={s.status} className="flex items-center gap-2 px-2.5 h-[22px] hover:bg-[var(--t-hover)] cursor-default">
                      <input type="checkbox" checked={checked} onChange={() => toggleStatus(s.status)} className="accent-[var(--t-accent)] w-3 h-3" />
                      <StatusGlyph status={s.status} width={14} />
                      <span className={`flex-1 ${checked ? 'text-zinc-200' : 'text-zinc-600'}`}>{s.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDiscoveryModalOpen(true)}
          className="t-btn !bg-transparent !border-transparent hover:!bg-[var(--t-hover)] !px-1.5"
          title="Discover candidate relationships from shared attributes (surnames, phones, domains…)"
        >
          <ScanSearch className="w-3.5 h-3.5" />
          {!isMedium && <span>Discover</span>}
        </button>

        <div className="flex-1" />

        {!isMedium && (
          <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums px-2 whitespace-nowrap" title="Visible nodes / edges">
            {visibleCounts.nodes} n · {visibleCounts.edges} e
          </span>
        )}
        {onSavePositions && (
          <button
            type="button"
            onClick={() => {
              handleSavePositions();
              showToast('Node positions saved');
            }}
            className="t-icon-btn"
            title="Save node positions"
          >
            <Save />
          </button>
        )}
        <button type="button" onClick={() => setIsPaletteOpen(!isPaletteOpen)} className="t-icon-btn" data-active={isPaletteOpen} title="Entity palette (drag types onto the canvas)">
          <Layers />
        </button>
        <button type="button" onClick={onCreateEntity} className="t-btn t-btn-primary ml-1" title="New entity  (N)">
          <Plus className="w-3 h-3" />
          {!isCompact && <span>Entity</span>}
        </button>
      </div>

      {/* Canvas area (palette docks inside it) */}
      <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handleCanvasDrop}
        className={`w-full h-full ${(isConnectKeyPressed || isConnectModeActive) ? 'cursor-crosshair' : ''}`}
      />

      {/* Keyboard-only node access: Cytoscape nodes have no DOM focus target otherwise. */}
      <div ref={nodeListRef} role="listbox" aria-label="Graph nodes" className="sr-only">
        {navigableNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            data-node-option={node.id}
            role="option"
            aria-selected={keyboardFocusedNodeId === node.id}
            tabIndex={(keyboardFocusedNodeId ?? navigableNodes[0]?.id) === node.id ? 0 : -1}
            onFocus={() => handleNodeListFocus(node.id)}
            onKeyDown={(e) => handleNodeListKeyDown(e, node.id, node.isNote)}
          >
            {node.label}
          </button>
        ))}
      </div>

      {/* Maltego Entity Palette */}
      <EntityPalette
        isOpen={isPaletteOpen}
        onToggle={() => setIsPaletteOpen(!isPaletteOpen)}
        onSelectTypeToAdd={handlePaletteSelectType}
      />
      </div>

      {/* Maltego Transform Output Console */}
      <TransformConsole
        logs={transformLogs}
        activeTransformName={activeRunningTransform?.name}
        activeEntityName={activeRunningTransform?.entityName}
        isRunning={isRunningTransform}
        onClearLogs={() => setTransformLogs([])}
      />

      {/* Dropped Entity Name Modal / Prompt */}
      {droppedEntityPrompt?.isOpen && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
          <div className="bg-[var(--t-raised)] border border-[var(--t-border)] rounded max-w-sm w-full p-4 shadow-popover text-xs space-y-3 animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{
                    backgroundColor: `${getEntityTypeColor(droppedEntityPrompt.type)}25`,
                    color: getEntityTypeColor(droppedEntityPrompt.type),
                    border: `1px solid ${getEntityTypeColor(droppedEntityPrompt.type)}60`,
                  }}
                >
                  <EntityIcon type={droppedEntityPrompt.type} className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-white capitalize text-sm">
                  Add {getEntityTypeLabel(droppedEntityPrompt.type)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDroppedEntityPrompt(null)}
                className="text-zinc-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = droppedEntityName.trim() || `New ${droppedEntityPrompt.type}`;
                if (onCreateEntityAtPosition) {
                  await onCreateEntityAtPosition(droppedEntityPrompt.type, droppedEntityPrompt.position, name);
                }
                setDroppedEntityPrompt(null);
                setDroppedEntityName('');
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">
                  Entity Value / Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={droppedEntityName}
                  onChange={(e) => setDroppedEntityName(e.target.value)}
                  placeholder={
                    droppedEntityPrompt.type === 'domain'
                      ? 'e.g. example.com'
                      : droppedEntityPrompt.type === 'ip'
                      ? 'e.g. 1.1.1.1'
                      : droppedEntityPrompt.type === 'email'
                      ? 'e.g. user@target.org'
                      : droppedEntityPrompt.type === 'account'
                      ? 'e.g. username'
                      : 'e.g. Name'
                  }
                  className="w-full bg-[var(--t-hover)] border border-[var(--t-border)] focus:border-[var(--t-accent)] rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDroppedEntityPrompt(null)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-obsidian-accent hover:bg-obsidian-accentHover text-white font-medium rounded-lg shadow-sm transition-colors"
                >
                  Place Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SVG Overlay for Interactive Relationship Dragging */}
      {connectionDrag && (
        <svg className="fixed inset-0 w-screen h-screen pointer-events-none z-50">
          <defs>
            <marker
              id="rel-arrow-head"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" />
            </marker>
          </defs>
          <path
            d={`M ${connectionDrag.startX} ${connectionDrag.startY} Q ${(connectionDrag.startX + connectionDrag.currentX) / 2} ${(connectionDrag.startY + connectionDrag.currentY) / 2 - 25}, ${connectionDrag.currentX} ${connectionDrag.currentY}`}
            stroke="#8b5cf6"
            strokeWidth="2.5"
            strokeDasharray="6,4"
            fill="none"
            markerEnd="url(#rel-arrow-head)"
          />
          <circle cx={connectionDrag.startX} cy={connectionDrag.startY} r="4.5" fill="#8b5cf6" />
          <circle
            cx={connectionDrag.currentX}
            cy={connectionDrag.currentY}
            r={connectionDrag.targetId ? '8' : '4.5'}
            fill={connectionDrag.targetId ? '#10b981' : '#8b5cf6'}
            stroke={connectionDrag.targetId ? '#ffffff' : 'none'}
            strokeWidth="2"
          />
        </svg>
      )}

      {/* Floating Drag Label near cursor */}
      {connectionDrag && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-12 bg-[var(--t-hover)]/95 border border-indigo-500/40 text-white px-3 py-1.5 rounded-full shadow-popover text-xs flex items-center space-x-2"
          style={{ left: connectionDrag.currentX, top: connectionDrag.currentY }}
        >
          <Share2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          {connectionDrag.targetName ? (
            <span className="font-medium">
              Connect to <b className="text-emerald-300">{connectionDrag.targetName}</b>
            </span>
          ) : (
            <span className="text-zinc-300">
              Drag from <b className="text-purple-300">{connectionDrag.sourceName}</b> to target node
            </span>
          )}
        </div>
      )}

      {/* Hover tooltip: compact facts about the entity under the cursor */}
      {hoveredNode && !contextMenu.visible && (() => {
        const width = 260;
        const padding = 12;
        let left = hoveredNode.x + 16;
        let top = hoveredNode.y + 12;
        if (typeof window !== 'undefined') {
          if (left + width > window.innerWidth - padding) left = hoveredNode.x - width - 16;
          if (left < padding) left = padding;
          if (top + 200 > window.innerHeight - padding) top = Math.max(padding, hoveredNode.y - 200);
        }

        if (hoveredNode.isNote && hoveredNote) {
          return (
            <div className="t-menu fixed z-40 pointer-events-none !py-2 !px-2.5 space-y-1" style={{ left, top, width }}>
              <div className="t-label">Note</div>
              <div className="text-[12.5px] font-semibold text-zinc-50 leading-snug">{hoveredNote.title}</div>
              <div className="text-[11.5px] text-zinc-400 line-clamp-3">{hoveredNote.markdownBody.slice(0, 180)}</div>
            </div>
          );
        }

        if (hoveredEntity) {
          const typeColor = getEntityTypeColor(hoveredEntity.type);
          return (
            <div className="t-menu fixed z-40 pointer-events-none !py-2 text-[12px]" style={{ left, top, width }}>
              <div className="px-2.5 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="t-swatch" style={{ background: typeColor }} />
                  <span className="t-label" style={{ color: typeColor }}>{getEntityTypeLabel(hoveredEntity.type)}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-zinc-500 tabular-nums">
                    {hoveredEntityRelations.length} links
                  </span>
                </div>
                <div className="text-[12.5px] font-semibold text-zinc-50 leading-snug break-words">{hoveredEntity.name}</div>
                {hoveredEntity.aliases?.length > 0 && (
                  <div className="text-[11px] text-zinc-500 truncate">aka {hoveredEntity.aliases.join(' · ')}</div>
                )}
              </div>
              {hoveredEntityRelations.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-[var(--t-border)] px-2.5 space-y-[3px]">
                  {hoveredEntityRelations.slice(0, 4).map((rel) => {
                    const s = rel.source_entity || (rel as any).source;
                    const t = rel.target_entity || (rel as any).target;
                    const isSource = s === hoveredEntity.id;
                    const otherId = isSource ? t : s;
                    const other = projectData.entities.find((e) => e.id === otherId);
                    return (
                      <div key={rel.id} className="flex items-center gap-1.5 text-[11px] min-w-0">
                        <span className="font-mono text-zinc-600 w-2.5 shrink-0">{isSource ? '→' : '←'}</span>
                        <span className="font-mono text-zinc-500 shrink-0 max-w-[90px] truncate">{rel.type}</span>
                        <span className="text-zinc-300 truncate">{other ? other.name : otherId}</span>
                      </div>
                    );
                  })}
                  {hoveredEntityRelations.length > 4 && (
                    <div className="text-[10.5px] text-zinc-600 pl-4">+{hoveredEntityRelations.length - 4} more</div>
                  )}
                </div>
              )}
              {hoveredEntityNotesPreview && (
                <div className="mt-1.5 pt-1.5 border-t border-[var(--t-border)] px-2.5 text-[11px] text-zinc-400 line-clamp-2">
                  {hoveredEntityNotesPreview}
                </div>
              )}
            </div>
          );
        }
        return null;
      })()}

      {/* Transient feedback, bottom-left of the canvas */}
      {toastMessage && (
        <div className="absolute bottom-[30px] left-2 z-30 px-2 h-[22px] flex items-center bg-[var(--t-raised)] border border-[var(--t-border)] rounded-[3px] text-[11.5px] text-zinc-300 pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu.visible && (() => {
        const width = 240;
        const padding = 12;
        let left = contextMenu.x;
        let top = contextMenu.y;

        // Accurate height estimate based on menu target type
        const estimatedHeight =
          contextMenu.targetType === 'node'
            ? contextMenu.isNote
              ? 210
              : 270
            : contextMenu.targetType === 'edge'
            ? 190
            : 175;

        if (typeof window !== 'undefined') {
          if (left + width > window.innerWidth - padding) {
            left = window.innerWidth - width - padding;
          }
          if (left < padding) left = padding;

          // If menu extends past bottom, flip it to open upwards from the cursor
          if (top + estimatedHeight > window.innerHeight - padding) {
            top = Math.max(padding, contextMenu.y - estimatedHeight);
          }
          if (top < padding) top = padding;
        }

        return (
          <div
            data-context-menu
            className="t-menu fixed z-[80] w-60 select-none"
            style={{ top: `${top}px`, left: `${left}px` }}
          >
            {/* Background Canvas Menu */}
            {contextMenu.targetType === 'background' && (
              <>
                <div className="px-2.5 pt-1 pb-1.5 border-b border-[var(--t-border)] mb-[3px]">
                  <div className="flex items-center space-x-1.5 text-white font-semibold text-xs">
                    <Layers className="w-3.5 h-3.5 text-obsidian-accent" />
                    <span>Investigation Canvas</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {projectData.entities.length} entities • {projectData.relationships.length} relationships
                  </div>
                </div>

                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onCreateEntity();
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Entity</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      cyRef.current?.fit(undefined, 40);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Fit Graph to Screen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      runLayout(layoutName);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item"
                  >
                    <div className="flex items-center space-x-2">
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Re-run Layout</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono capitalize">{layoutName}</span>
                  </button>

                  {onSavePositions && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSavePositions();
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                        showToast('Graph layout positions saved');
                      }}
                      className="t-menu-item"
                    >
                      <Save className="w-3.5 h-3.5 opacity-70" />
                      <span>Save Node Positions</span>
                    </button>
                  )}

                  {hiddenNodeIds.size > 0 && (
                    <>
                      <div className="t-menu-sep" />
                      <button
                        type="button"
                        onClick={() => {
                          setHiddenNodeIds(new Set());
                          setContextMenu((prev) => ({ ...prev, visible: false }));
                          showToast(`Restored ${hiddenNodeIds.size} hidden nodes`);
                        }}
                        className="t-menu-item"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Unhide All ({hiddenNodeIds.size})</span>
                      </button>
                    </>
                  )}

                  {focusedNodeId && (
                    <button
                      type="button"
                      onClick={() => {
                        clearFocus();
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Clear Isolation</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Note Node Menu */}
            {contextMenu.targetType === 'node' && contextMenu.isNote && selectedNodeNote && (
              <>
                <div className="px-2.5 pt-1 pb-1.5 border-b border-[var(--t-border)] mb-[3px]">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white text-xs truncate">
                        {selectedNodeNote.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">{selectedNodeNote.id}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenNote?.(selectedNodeNote.id);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item"
                  >
                    <div className="flex items-center space-x-2">
                      <ExternalLink className="w-3.5 h-3.5 text-obsidian-accent" />
                      <span>Open Note</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">Double Click</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedNodeNote.title, 'title')}
                    className="t-menu-item"
                  >
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy Note Title</span>
                  </button>

                  <div className="t-menu-sep" />

                  {onDeleteNote && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteNote(selectedNodeNote.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item !text-rose-400 hover:!bg-rose-500/70 hover:!text-white"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Note</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Entity Node Menu */}
            {contextMenu.targetType === 'node' && !contextMenu.isNote && selectedNodeEntity && (() => {
              const typeColor = getEntityTypeColor(selectedNodeEntity.type);
              return (
                <>
                  <div className="px-2.5 pt-1 pb-1.5 border-b border-[var(--t-border)] mb-[3px]">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${typeColor}25`,
                          border: `1px solid ${typeColor}60`,
                          color: typeColor,
                        }}
                      >
                        <EntityIcon type={selectedNodeEntity.type} className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white text-xs truncate">
                          {selectedNodeEntity.name}
                        </div>
                        <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400">
                          <span
                            className="font-medium text-[9px] uppercase tracking-wider"
                            style={{ color: typeColor }}
                          >
                            {selectedNodeEntity.type}
                          </span>
                          <span className="text-zinc-600">•</span>
                          <span className="font-mono text-zinc-500 truncate">{selectedNodeEntity.id}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    {/* Maltego Transforms Runner Section */}
                    {(() => {
                      const nodeTransforms = getTransformsForEntity(selectedNodeEntity.type);
                      if (nodeTransforms.length === 0) return null;

                      return (
                        <div className="mb-1.5 pb-1.5 border-b border-[var(--t-border)]">
                          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                            <span className="flex items-center space-x-1">
                              <Zap className="w-3 h-3 fill-amber-400/20" />
                              <span>Maltego Transforms</span>
                            </span>
                            <span className="text-[9px] text-zinc-500 font-mono font-normal">
                              {nodeTransforms.length} available
                            </span>
                          </div>

                          <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                            {nodeTransforms.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  handleExecuteTransform(selectedNodeEntity, t);
                                  setContextMenu((prev) => ({ ...prev, visible: false }));
                                }}
                                className="w-full px-2 py-1 flex items-center justify-between text-left hover:bg-amber-500/15 text-zinc-200 hover:text-white rounded-md transition-colors group"
                              >
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  {t.isMachine ? (
                                    <ScanSearch className="w-3 h-3 text-purple-400 shrink-0" />
                                  ) : (
                                    <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                  )}
                                  <span className="text-[11px] truncate group-hover:text-amber-300 font-medium">
                                    {t.name}
                                  </span>
                                </div>
                                {t.isMachine && (
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/20 px-1 py-0.2 rounded shrink-0">
                                    Machine
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => {
                        onOpenEntity(selectedNodeEntity.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item"
                    >
                      <div className="flex items-center space-x-2">
                        <ExternalLink className="w-3.5 h-3.5 text-obsidian-accent" />
                        <span>Open Entity Markdown</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">Double Click</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onCreateRelationshipFromEntity(selectedNodeEntity.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item"
                    >
                      <Share2 className="w-3.5 h-3.5 opacity-70" />
                      <span>Connect with Relationship</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        focusNodeNeighborhood(selectedNodeEntity.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item"
                    >
                      <Crosshair className="w-3.5 h-3.5 opacity-70" />
                      <span>Focus & Isolate Neighbors</span>
                    </button>

                    {/* Maltego Graph Selection Tools */}
                    <div className="space-y-0.5 py-1 border-t border-[var(--t-border)] my-1">
                      <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        Investigation Selection
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          selectNeighbors(selectedNodeEntity.id, 'all');
                          setContextMenu((prev) => ({ ...prev, visible: false }));
                        }}
                        className="t-menu-item"
                      >
                        <Share2 className="w-3.5 h-3.5 opacity-70" />
                        <span>Select All Neighbors</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          selectByType(selectedNodeEntity.type);
                          setContextMenu((prev) => ({ ...prev, visible: false }));
                        }}
                        className="t-menu-item"
                      >
                        <Boxes className="w-3.5 h-3.5 opacity-70" />
                        <span>Select All {selectedNodeEntity.type} Nodes</span>
                      </button>
                    </div>

                    <div className="t-menu-sep" />

                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedNodeEntity.name, 'name')}
                      className="t-menu-item"
                    >
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy Entity Name</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedNodeEntity.id, 'ID')}
                      className="t-menu-item"
                    >
                      <Hash className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy Entity ID</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setHiddenNodeIds((prev) => new Set([...prev, selectedNodeEntity.id]));
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                        showToast(`Hidden "${selectedNodeEntity.name}" from graph`);
                      }}
                      className="t-menu-item"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Hide from Canvas</span>
                    </button>

                    <div className="t-menu-sep" />

                    <button
                      type="button"
                      onClick={() => {
                        onDeleteEntity(selectedNodeEntity.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className="t-menu-item !text-rose-400 hover:!bg-rose-500/70 hover:!text-white"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Entity</span>
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Edge Menu */}
            {contextMenu.targetType === 'edge' && selectedEdge && (
              <>
                <div className="px-2.5 pt-1 pb-1.5 border-b border-[var(--t-border)] mb-[3px]">
                  <div className="text-[10px] uppercase font-mono text-purple-400 font-semibold mb-0.5">
                    {selectedEdge.type}
                  </div>
                  <div className="text-xs text-white font-medium truncate flex items-center space-x-1">
                    <span className="truncate">
                      {edgeSourceEntity
                        ? edgeSourceEntity.name
                        : selectedEdge.source_entity || (selectedEdge as any).source}
                    </span>
                    <span className="text-zinc-500 shrink-0">→</span>
                    <span className="truncate">
                      {edgeTargetEntity
                        ? edgeTargetEntity.name
                        : selectedEdge.target_entity || (selectedEdge as any).target}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center space-x-2 text-[10px] text-zinc-400">
                    <span>Status:</span>
                    <span className="font-mono text-zinc-300 capitalize">{selectedEdge.status}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenRelationship(selectedEdge.id);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item"
                  >
                    <div className="flex items-center space-x-2">
                      <ExternalLink className="w-3.5 h-3.5 text-obsidian-accent" />
                      <span>Open Relationship</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">Double Click</span>
                  </button>

                  {/* Confirm Unverified Relationship */}
                  {onConfirmRelationship && (selectedEdge.status === 'unverified' || selectedEdge.status === 'candidate') && (
                    <button
                      type="button"
                      onClick={() => {
                        onConfirmRelationship(selectedEdge.id);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                        showToast(`Confirmed relationship: ${selectedEdge.type}`);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center space-x-2 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/60 rounded-lg text-left transition-colors font-medium"
                    >
                      <CheckCheck className="w-3.5 h-3.5 opacity-70" />
                      <span>Confirm Relationship</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const src = edgeSourceEntity
                        ? edgeSourceEntity.name
                        : selectedEdge.source_entity || (selectedEdge as any).source;
                      const tgt = edgeTargetEntity
                        ? edgeTargetEntity.name
                        : selectedEdge.target_entity || (selectedEdge as any).target;
                      copyToClipboard(`${src} —[${selectedEdge.type}]→ ${tgt}`, 'relationship info');
                    }}
                    className="t-menu-item"
                  >
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy Relationship Text</span>
                  </button>

                  <div className="t-menu-sep" />

                  <button
                    type="button"
                    onClick={() => {
                      onDeleteRelationship(selectedEdge.id);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="t-menu-item !text-rose-400 hover:!bg-rose-500/70 hover:!text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Relationship</span>
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Relationship Discovery Modal */}
      <RelationshipDiscoveryModal
        isOpen={discoveryModalOpen}
        onClose={() => setDiscoveryModalOpen(false)}
        entities={projectData.entities}
        relationships={projectData.relationships}
        onAddRelationships={(newRels) => {
          onBatchAddRelationships?.(newRels);
        }}
      />
    </div>
  );
};
