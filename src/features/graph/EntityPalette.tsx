import React, { useState, useMemo } from 'react';
import { EntityType, ENTITY_TYPES } from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Boxes,
  ScanSearch,
  GripVertical,
  X,
} from 'lucide-react';

interface EntityPaletteProps {
  isOpen: boolean;
  onToggle: () => void;
  onSelectTypeToAdd?: (type: EntityType) => void;
  className?: string;
}

interface PaletteCategory {
  id: string;
  name: string;
  types: EntityType[];
}

const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: 'infra',
    name: 'Infrastructure',
    types: ['domain', 'ip', 'website'],
  },
  {
    id: 'personal',
    name: 'Personal & Accounts',
    types: ['person', 'email', 'phone', 'account'],
  },
  {
    id: 'orgs',
    name: 'Organizations',
    types: ['company', 'organization'],
  },
  {
    id: 'geo',
    name: 'Geo & Chronology',
    types: ['location', 'event'],
  },
  {
    id: 'evidence',
    name: 'Evidence & Records',
    types: ['document', 'custom'],
  },
];

export const EntityPalette: React.FC<EntityPaletteProps> = ({
  isOpen,
  onToggle,
  onSelectTypeToAdd,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return PALETTE_CATEGORIES;

    return PALETTE_CATEGORIES.map((cat) => {
      const matchingTypes = cat.types.filter((t) => {
        const item = ENTITY_TYPES.find((et) => et.type === t);
        return t.toLowerCase().includes(q) || item?.label.toLowerCase().includes(q);
      });
      return { ...cat, types: matchingTypes };
    }).filter((cat) => cat.types.length > 0);
  }, [searchQuery]);

  const handleDragStart = (e: React.DragEvent, type: EntityType) => {
    e.dataTransfer.setData('application/trace-entity-type', type);
    e.dataTransfer.effectAllowed = 'copy';

    // Transparent drag preview styling
    const dragPreview = document.createElement('div');
    dragPreview.textContent = type.toUpperCase();
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.style.padding = '4px 8px';
    dragPreview.style.background = '#1e1b4b';
    dragPreview.style.color = '#c7d2fe';
    dragPreview.style.borderRadius = '6px';
    dragPreview.style.border = '1px solid #6366f1';
    dragPreview.style.fontSize = '11px';
    dragPreview.style.fontWeight = 'bold';
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 10, 10);
    setTimeout(() => document.body.removeChild(dragPreview), 0);
  };

  if (!isOpen) return null;

  return (
    <aside
      className={`absolute top-0 left-0 bottom-0 z-10 w-[188px] flex flex-col bg-[var(--t-panel)] border-r border-[var(--t-border)] select-none text-[12px] overflow-hidden ${className}`}
    >
      <div className="t-panel-head justify-between">
        <span className="t-label">Palette</span>
        <button type="button" onClick={onToggle} className="t-icon-btn !w-5 !h-5" title="Close palette">
          <X />
        </button>
      </div>
      <div className="p-1.5 border-b border-[var(--t-border-subtle)]">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
          placeholder="Filter types…"
          className="t-input"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filteredCategories.map((cat) => (
          <div key={cat.id} className="mb-1">
            <div className="px-2.5 h-[20px] flex items-center t-label">{cat.name}</div>
            {cat.types.map((type) => {
              const config = ENTITY_TYPES.find((et) => et.type === type);
              const color = config ? config.color : getEntityTypeColor(type);
              const label = config ? config.label : type;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, type)}
                  onDoubleClick={() => onSelectTypeToAdd?.(type)}
                  className="group t-row !pl-2.5 cursor-grab active:cursor-grabbing"
                  title={`Drag onto the canvas, or double-click to add a ${label}`}
                >
                  <span className="shrink-0" style={{ color }}>
                    <EntityIcon type={type} className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate flex-1">{label}</span>
                  <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100" />
                </div>
              );
            })}
          </div>
        ))}
        {filteredCategories.length === 0 && <div className="px-2.5 py-2 text-zinc-600">No matching types</div>}
      </div>
      <div className="h-[22px] px-2.5 flex items-center border-t border-[var(--t-border)] text-[10.5px] text-zinc-600">
        Drag to canvas · double-click to add
      </div>
    </aside>
  );
};
