import React, { useState } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { MapPin, X, ExternalLink, Search, Copy, Check } from 'lucide-react';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationQuery: string;
  title?: string;
}

export const MapModal: React.FC<MapModalProps> = ({
  isOpen,
  onClose,
  locationQuery,
  title,
}) => {
  const [search, setSearch] = useState<string>(locationQuery);
  const [activeQuery, setActiveQuery] = useState<string>(locationQuery);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync if locationQuery prop changes
  React.useEffect(() => {
    setSearch(locationQuery);
    setActiveQuery(locationQuery);
  }, [locationQuery]);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setActiveQuery(search.trim());
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const encodedQuery = encodeURIComponent(activeQuery);
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?layer=mapnik&query=${encodedQuery}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  const osmUrl = `https://www.openstreetmap.org/search?query=${encodedQuery}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55">
      <div
        className="w-full max-w-3xl bg-[var(--t-panel)] border border-[var(--t-border)] rounded shadow-popover overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--t-border)] bg-[var(--t-hover)]">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h2 className="text-sm font-semibold text-white truncate">
                {title ? `Location Map: ${title}` : 'Location Map Intelligence'}
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">{activeQuery}</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 text-xs bg-[var(--t-active)] hover:bg-[var(--t-hover)] text-zinc-200 border border-zinc-700/50 rounded-lg flex items-center space-x-1 transition-colors"
              title="Copy location query"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 text-xs bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-lg flex items-center space-x-1 transition-colors"
            >
              <span>Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <a
              href={osmUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center space-x-1 transition-colors"
            >
              <span>OSM</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="px-5 py-2.5 bg-[var(--t-raised)] border-b border-[var(--t-border)] flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or refine address, coordinates, city, or postal code..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[var(--t-accent)]"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shrink-0"
          >
            Locate
          </button>
        </form>

        {/* Map Canvas Embed */}
        <div className="flex-1 bg-[var(--t-bg)] relative min-h-[380px] overflow-hidden">
          <iframe
            title="OpenStreetMap Location"
            src={osmEmbedUrl}
            className="w-full h-full border-0 absolute inset-0"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>

        {/* Footer info */}
        <div className="px-5 py-2 bg-[var(--t-raised)] border-t border-[var(--t-border)] flex items-center justify-between text-[11px] text-zinc-400">
          <span>Map intelligence powered by OpenStreetMap</span>
          <span className="font-mono text-zinc-500">{activeQuery}</span>
        </div>
      </div>
    </div>
  );
};
