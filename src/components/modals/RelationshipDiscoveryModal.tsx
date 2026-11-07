import React, { useState, useMemo } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { Entity, Relationship, EntityType, RelationshipStatus } from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import {
  SuggestedRelationship,
  discoverRelationships,
} from '@/services/discovery/relationshipDiscovery';
import {
  ScanSearch,
  X,
  Check,
  CheckCheck,
  ArrowRight,
  ShieldAlert,
  Search,
  Filter,
  Users,
  Phone,
  Building,
  Server,
  AtSign,
  FileText,
  BadgeAlert,
  SlidersHorizontal,
} from 'lucide-react';

interface RelationshipDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entities: Entity[];
  relationships: Relationship[];
  onAddRelationships: (
    newRels: Array<{
      source_entity: string;
      target_entity: string;
      type: string;
      status: RelationshipStatus;
      confidence?: number;
      evidence: string[];
    }>
  ) => void;
}

export const RelationshipDiscoveryModal: React.FC<RelationshipDiscoveryModalProps> = ({
  isOpen,
  onClose,
  entities,
  relationships,
  onAddRelationships,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<number>(50);

  // Run discovery algorithm
  const allSuggestions = useMemo(() => {
    if (!isOpen) return [];
    return discoverRelationships(entities, relationships);
  }, [isOpen, entities, relationships]);

  // Initialize all selected by default when opened
  React.useEffect(() => {
    if (isOpen && allSuggestions.length > 0) {
      setSelectedIds(new Set(allSuggestions.map((s) => s.id)));
    }
  }, [isOpen, allSuggestions]);

  // Filtered suggestions
  const filteredSuggestions = useMemo(() => {
    return allSuggestions.filter((s) => {
      if (s.confidence < minConfidence) return false;
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName =
          s.sourceEntityName.toLowerCase().includes(q) ||
          s.targetEntityName.toLowerCase().includes(q) ||
          s.evidence.toLowerCase().includes(q) ||
          s.suggestedType.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      return true;
    });
  }, [allSuggestions, minConfidence, activeCategory, searchQuery]);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredSuggestions.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = (status: RelationshipStatus = 'unverified') => {
    const toAdd = allSuggestions.filter((s) => selectedIds.has(s.id));
    if (toAdd.length === 0) return;

    const payload = toAdd.map((s) => ({
      source_entity: s.sourceEntityId,
      target_entity: s.targetEntityId,
      type: s.suggestedType,
      status: status, // User requested: 'unverified'
      confidence: s.confidence,
      evidence: [s.evidence],
    }));

    onAddRelationships(payload);
    onClose();
  };

  const categories = [
    { id: 'all', label: 'All', icon: ScanSearch, count: allSuggestions.length },
    {
      id: 'surname',
      label: 'Surnames',
      icon: Users,
      count: allSuggestions.filter((s) => s.category === 'surname').length,
    },
    {
      id: 'contact',
      label: 'Contacts',
      icon: Phone,
      count: allSuggestions.filter((s) => s.category === 'contact').length,
    },
    {
      id: 'corporate',
      label: 'Corporate',
      icon: Building,
      count: allSuggestions.filter((s) => s.category === 'corporate').length,
    },
    {
      id: 'infrastructure',
      label: 'Infra/IP',
      icon: Server,
      count: allSuggestions.filter((s) => s.category === 'infrastructure').length,
    },
    {
      id: 'attribute',
      label: 'Identifiers',
      icon: AtSign,
      count: allSuggestions.filter((s) => s.category === 'attribute').length,
    },
    {
      id: 'mention',
      label: 'Mentions',
      icon: FileText,
      count: allSuggestions.filter((s) => s.category === 'mention').length,
    },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
      <div className="bg-[var(--t-raised)] border border-obsidian-border rounded max-w-2xl w-full shadow-popover flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-obsidian-border bg-[var(--t-panel)]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <ScanSearch className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Relationship Discovery</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {allSuggestions.length} found
                </span>
              </h2>
              <p className="text-[11px] text-obsidian-muted">
                Heuristics scan for shared surnames, phones, corporate domains, and attributes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-obsidian-dim hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-2.5 border-b border-obsidian-borderSubtle bg-[var(--t-panel)] space-y-2">
          {/* Search & Confidence Slider */}
          <div className="flex items-center space-x-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-obsidian-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by entity name, attribute or evidence..."
                className="w-full pl-8 pr-3 py-1 bg-[var(--t-bg)] border border-obsidian-border rounded-lg text-xs text-obsidian-text placeholder:text-obsidian-dim focus:outline-none focus:border-[var(--t-accent)]"
              />
            </div>

            <div className="flex items-center space-x-1.5 text-[11px] text-obsidian-dim shrink-0 bg-[var(--t-bg)] px-2 py-1 rounded-lg border border-obsidian-border">
              <span>Min Conf:</span>
              <input
                type="range"
                min="30"
                max="90"
                step="5"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="w-16 accent-purple-500 cursor-pointer"
              />
              <span className="font-mono text-purple-300 w-7 text-right">{minConfidence}%</span>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              if (cat.id !== 'all' && cat.count === 0) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs flex items-center space-x-1.5 shrink-0 transition-colors ${
                    active
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 font-medium'
                      : 'text-obsidian-dim hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-60">({cat.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List of Suggestions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((sug) => {
              const isChecked = selectedIds.has(sug.id);
              const colorA = getEntityTypeColor(sug.sourceEntityType);
              const colorB = getEntityTypeColor(sug.targetEntityType);

              return (
                <div
                  key={sug.id}
                  onClick={() => toggleSelect(sug.id)}
                  className={`p-3 rounded border transition-colors cursor-pointer select-none ${
                    isChecked
                      ? 'bg-purple-950/20 border-purple-500/40 shadow-sm'
                      : 'bg-[var(--t-panel)]/70 border-obsidian-borderSubtle hover:border-obsidian-border hover:bg-[var(--t-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Checkbox */}
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-purple-600 text-white'
                            : 'border border-obsidian-border bg-[var(--t-bg)]'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>

                      {/* Source Entity */}
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: colorA }}
                        />
                        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                          {sug.sourceEntityName}
                        </span>
                        <span className="text-[10px] text-obsidian-dim uppercase font-mono">
                          {sug.sourceEntityType}
                        </span>
                      </div>

                      {/* Arrow & Suggested Relation Type */}
                      <div className="flex items-center space-x-1 shrink-0 px-2 py-0.5 rounded-full bg-[var(--t-active)] border border-obsidian-border text-[10px] text-purple-300 font-mono">
                        <span>{sug.suggestedType}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-obsidian-dim" />
                      </div>

                      {/* Target Entity */}
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: colorB }}
                        />
                        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                          {sug.targetEntityName}
                        </span>
                        <span className="text-[10px] text-obsidian-dim uppercase font-mono">
                          {sug.targetEntityType}
                        </span>
                      </div>
                    </div>

                    {/* Confidence & Unverified Badge */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                        <ShieldAlert className="w-2.5 h-2.5" />
                        <span>Unverified</span>
                      </span>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {sug.confidence}%
                      </span>
                    </div>
                  </div>

                  {/* Evidence explanation */}
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className="text-purple-400 font-medium">Evidence:</span>
                      <span className="truncate text-zinc-300 font-mono">{sug.evidence}</span>
                    </div>
                    <span className="text-[10px] text-obsidian-dim capitalize">
                      rule: {sug.category}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center space-y-2">
              <ScanSearch className="w-8 h-8 text-obsidian-dim mx-auto stroke-1" />
              <div className="text-xs font-medium text-obsidian-muted">
                {allSuggestions.length === 0
                  ? 'No potential relationships discovered yet'
                  : 'No suggestions match your filters'}
              </div>
              <p className="text-[11px] text-obsidian-dim max-w-sm mx-auto">
                {allSuggestions.length === 0
                  ? 'Add more entities with attributes (phones, emails, domains, organizations, surnames) to run discovery.'
                  : 'Try lowering the minimum confidence threshold or clearing the search filter.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-obsidian-border bg-[var(--t-panel)] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            <span className="text-obsidian-dim text-[11px]">
              <strong className="text-white font-mono">{selectedIds.size}</strong> of{' '}
              {filteredSuggestions.length} selected
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="text-purple-400 hover:text-purple-300 text-[11px] font-medium"
            >
              Select All
            </button>
            <span className="text-obsidian-dim text-[10px]">•</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-obsidian-dim hover:text-white text-[11px]"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-obsidian-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>

            {/* Direct Confirmation Button */}
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => handleApply('confirmed')}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-1"
              title="Add selected links directly as Confirmed"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Confirm Directly</span>
            </button>

            {/* Primary: Mark as Unverified (as requested by user) */}
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => handleApply('unverified')}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center space-x-1.5"
              title="Add selected links as unverified so user can review/confirm later"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Add as Unverified ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
