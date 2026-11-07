import React, { useEffect } from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcutGroups: ShortcutGroup[] = [
    {
      category: 'General & Navigation',
      items: [
        { keys: [modKey, 'K'], description: 'Open Command Palette' },
        { keys: [modKey, 'G'], description: 'Open Interactive Graph canvas' },
        { keys: [modKey, 'O'], description: 'Open Project Overview' },
        { keys: [modKey, 'F'], description: 'Full-text local SQLite search' },
        { keys: [modKey, ','], description: 'Open Application Settings' },
        { keys: ['?'], description: 'Open this Keyboard Shortcuts cheat-sheet' },
        { keys: [modKey, '['], description: 'Toggle Left Project Sidebar' },
        { keys: [modKey, ']'], description: 'Toggle Right Inspector Sidebar' },
      ],
    },
    {
      category: 'Tabs & Editors (VS Code Style)',
      items: [
        { keys: ['Click'], description: 'Open in preview tab (replaced on next click if unedited)' },
        { keys: ['Double-Click'], description: 'Pin tab permanently' },
        { keys: ['Right-Click'], description: 'Tab context menu (Pin, Close, Close Others)' },
        { keys: ['Esc'], description: 'Close modals, autocomplete or context menus' },
      ],
    },
    {
      category: 'Interactive Graph Canvas',
      items: [
        { keys: ['Scroll'], description: 'Zoom in / Zoom out' },
        { keys: ['Drag Canvas'], description: 'Pan graph view' },
        { keys: ['Drag Node'], description: 'Move node with real-time repulsive physics bounce' },
        { keys: ['Right-Click Node'], description: 'Node context menu (link, open, pin, delete)' },
        { keys: ['Right-Click Background'], description: 'Graph menu (create entity, reset, fit)' },
        { keys: ['Hover Node'], description: 'Glow aura, highlight direct neighbors & inspect attributes' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55">
      <div className="bg-[var(--t-raised)] border border-obsidian-border rounded w-full max-w-2xl shadow-popover flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-obsidian-border bg-[var(--t-panel)]/80">
          <div className="flex items-center space-x-2.5">
            
            <div>
              <h2 className="text-sm font-semibold text-white">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-obsidian-dim">Quick navigation and graph productivity keys</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-obsidian-dim hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6">
          {shortcutGroups.map((group) => (
            <div key={group.category} className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-obsidian-muted flex items-center space-x-2">
                <span>{group.category}</span>
                <span className="flex-1 h-px bg-white/5" />
              </h3>

              <div className="grid grid-cols-1 gap-2">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <span className="text-xs text-zinc-300">{item.description}</span>
                    <div className="flex items-center space-x-1 shrink-0 ml-3">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-obsidian-border bg-[var(--t-panel)]/60 flex items-center justify-between text-[11px] text-zinc-600">
          <div className="flex items-center space-x-1.5">
            <Command className="w-3.5 h-3.5" />
            <span>Trace OSINT Investigation Tool</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
