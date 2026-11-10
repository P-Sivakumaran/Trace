import React, { useState, useEffect } from 'react';
import { SearchResult } from '@/types';
import { EntityIcon } from '@/components/common/EntityIcon';
import {
  Search,
  Layers,
  Share2,
  Globe,
  FileText,
  FolderKanban,
  ArrowRight,
  ExternalLink,
  X,
} from 'lucide-react';

interface SearchViewProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelectResult: (result: SearchResult) => void;
  initialQuery?: string;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onSearch,
  onSelectResult,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await onSearch(query);
        if (active) setResults(res);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  // Group by type
  const entityResults = results.filter((r) => r.type === 'entity');
  const relResults = results.filter((r) => r.type === 'relationship');
  const sourceResults = results.filter((r) => r.type === 'source');
  const noteResults = results.filter((r) => r.type === 'note');
  const projectResults = results.filter((r) => r.type === 'project');

  const groups: { label: string; items: typeof results }[] = [
    { label: 'Entities', items: entityResults },
    { label: 'Relationships', items: relResults },
    { label: 'Sources', items: sourceResults },
    { label: 'Notes', items: noteResults },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)]">
      <div className="h-[36px] shrink-0 flex items-center gap-2 px-2 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <div className="relative flex-1 max-w-[640px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search entities, aliases, attributes, evidence, notes"
            className="t-input !h-[26px] !pl-7 !text-[12.5px]"
          />
        </div>
        {query && (
          <button type="button" onClick={() => setQuery('')} className="t-icon-btn" title="Clear">
            <X />
          </button>
        )}
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums">
          {isLoading ? 'searching…' : `${results.length} matches · SQLite FTS`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto text-[12px]">
        {!query && (
          <div className="px-4 py-3 text-zinc-600">
            Full-text search across every record in this case. Matches names, aliases, attribute values, source extracts and note bodies.
          </div>
        )}
        {!isLoading && query && results.length === 0 && (
          <div className="px-4 py-3 text-zinc-500">No records match “{query}”.</div>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <div className="h-[24px] flex items-center gap-2 px-4 bg-[var(--t-panel)] border-b border-[var(--t-border)] sticky top-0">
              <span className="t-label">{g.label}</span>
              <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{g.items.length}</span>
            </div>
            {g.items.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectResult(item)}
                className="px-4 py-[5px] border-b border-[var(--t-border-subtle)] hover:bg-[var(--t-hover)] cursor-pointer"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-zinc-100 truncate">{item.title}</span>
                  <span className="text-[11px] text-zinc-500 truncate">{item.subtitle}</span>
                  <span className="ml-auto font-mono text-[10px] text-zinc-600 shrink-0">{item.id}</span>
                </div>
                {item.snippet && <div className="text-[11.5px] text-zinc-500 truncate font-mono">{item.snippet}</div>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
