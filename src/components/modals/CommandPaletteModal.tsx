import React, { useState, useEffect } from 'react';
import { ProjectData, TabType } from '@/types';
import { EntityIcon } from '@/components/common/EntityIcon';
import {
  Search,
  Layers,
  Compass,
  Plus,
  Share2,
  FileText,
  Globe,
  ArrowRight,
  X,
} from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData?: ProjectData | null;
  onOpenTab: (type: TabType, targetId?: string, title?: string) => void;
  onCreateEntity: () => void;
  onCreateRelationship: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  projectData,
  onOpenTab,
  onCreateEntity,
  onCreateRelationship,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  // Filter entities
  const matchingEntities = (projectData?.entities || []).filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)) ||
      e.type.toLowerCase().includes(q)
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 flex items-start justify-center pt-24 p-4">
      <div className="bg-[var(--t-panel)] border border-[#2e2f34] rounded-[4px] max-w-lg w-full shadow-popover overflow-hidden text-[12px] flex flex-col">
        {/* Search Input */}
        <div className="flex items-center px-3.5 py-3 border-b border-obsidian-border bg-[var(--t-panel)]">
          <Search className="w-4 h-4 text-obsidian-muted mr-2.5" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to an entity..."
            className="flex-1 bg-transparent text-sm text-obsidian-text focus:outline-none placeholder:text-obsidian-dim"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--t-hover)] border border-obsidian-border text-[10px] text-obsidian-dim font-mono">
            ESC
          </kbd>
        </div>

        {/* Action Commands list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {/* Quick Views */}
          <div className="text-[10px] font-semibold text-obsidian-dim uppercase px-2 py-1">
            Navigation Views
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenTab('graph', undefined, 'Interactive Graph');
              onClose();
            }}
            className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 opacity-70" />
              <span>Open Interactive Graph View</span>
            </div>
            <span className="text-[10px] text-obsidian-dim font-mono">View</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenTab('overview', undefined, 'Project Overview');
              onClose();
            }}
            className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Compass className="w-3.5 h-3.5 opacity-70" />
              <span>Project Overview & Scope</span>
            </div>
            <span className="text-[10px] text-obsidian-dim font-mono">View</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenTab('search', undefined, 'Search');
              onClose();
            }}
            className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Search className="w-3.5 h-3.5 opacity-70" />
              <span>Full-Text Search Investigation</span>
            </div>
            <span className="text-[10px] text-obsidian-dim font-mono">Search</span>
          </button>

          {/* Quick Create */}
          <div className="text-[10px] font-semibold text-obsidian-dim uppercase px-2 py-1 pt-2">
            Create Actions
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateEntity();
            }}
            className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Plus className="w-3.5 h-3.5 opacity-70" />
              <span>Create New Investigation Entity</span>
            </div>
            <span className="text-[10px] text-obsidian-dim font-mono">New Entity</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateRelationship();
            }}
            className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Share2 className="w-3.5 h-3.5 opacity-70" />
              <span>Create Relationship Claim</span>
            </div>
            <span className="text-[10px] text-obsidian-dim font-mono">New Rel</span>
          </button>

          {/* Entities list */}
          {matchingEntities.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-obsidian-dim uppercase px-2 py-1 pt-2">
                Entities ({matchingEntities.length})
              </div>
              {matchingEntities.slice(0, 8).map((ent) => (
                <button
                  key={ent.id}
                  type="button"
                  onClick={() => {
                    onOpenTab('entity', ent.id, ent.name);
                    onClose();
                  }}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-obsidian-hover text-obsidian-text text-left transition-colors"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <EntityIcon type={ent.type} className="w-3.5 h-3.5" />
                    <span className="truncate">{ent.name}</span>
                    {ent.aliases.length > 0 && (
                      <span className="text-[10px] text-obsidian-dim font-mono">
                        ({ent.aliases[0]})
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-obsidian-dim font-mono">{ent.type}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
