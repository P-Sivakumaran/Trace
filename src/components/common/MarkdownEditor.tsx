import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isSafeUrl } from '@/utils/url';
import {
  Bold,
  Italic,
  Code,
  List,
  Quote,
  Eye,
  Edit3,
  Columns,
  Link as LinkIcon,
  Image as ImageIcon,
  HelpCircle,
} from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  onWikilinkClick?: (targetId: string) => void;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write notes in Markdown...',
  minHeight = '250px',
  onWikilinkClick,
}) => {
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('edit');

  const insertSnippet = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('markdown-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.substring(start, end);
    const replacement = `${prefix}${selection || 'text'}${suffix}`;
    const nextValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selection.length || 4));
    }, 10);
  };

  // Convert wikilinks [[id]] into custom link or text for rendering
  const processedMarkdown = value.replace(/\[\[(.*?)\]\]/g, (_, target) => {
    return `[${target}](#wikilink:${target})`;
  });

  return (
    <div className="flex flex-col border border-[var(--t-border)] rounded-[3px] bg-[var(--t-bg)] overflow-hidden">
      {/* Toolbar */}
      <div className="h-[28px] flex items-center justify-between px-1.5 bg-[var(--t-panel)] border-b border-[var(--t-border)] text-xs text-zinc-500 select-none">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => insertSnippet('**', '**')}
            className="t-icon-btn"
            title="Bold (**text**)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('*', '*')}
            className="t-icon-btn"
            title="Italic (*text*)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('`', '`')}
            className="t-icon-btn"
            title="Code (`code`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <span className="w-px h-3 bg-obsidian-border mx-1" />
          <button
            type="button"
            onClick={() => insertSnippet('\n- ')}
            className="t-icon-btn"
            title="Unordered list"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('\n> ')}
            className="t-icon-btn"
            title="Quote block"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('![Image](', ')')}
            className="t-icon-btn"
            title="Insert image (![Image](url))"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('[[', ']]')}
            className="h-6 px-1.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-[var(--t-hover)] rounded-[3px]"
            title="Insert Obsidian Wikilink [[entity-id]]"
          >
            [[wikilink]]
          </button>
        </div>

        {/* View Switcher */}
        <div className="flex items-stretch h-[22px] border border-[var(--t-border)] rounded-[3px] overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`px-2 flex items-center gap-1 text-[11px] border-l border-[var(--t-border)] first:border-l-0 ${
              mode === 'edit' ? 'bg-[var(--t-active)] text-zinc-100' : 'hover:text-zinc-200'
            }`}
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('split')}
            className={`px-2 flex items-center gap-1 text-[11px] border-l border-[var(--t-border)] first:border-l-0 ${
              mode === 'split' ? 'bg-[var(--t-active)] text-zinc-100' : 'hover:text-zinc-200'
            }`}
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-2 flex items-center gap-1 text-[11px] border-l border-[var(--t-border)] first:border-l-0 ${
              mode === 'preview' ? 'bg-[var(--t-active)] text-zinc-100' : 'hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight }}>
        {/* Textarea */}
        {(mode === 'edit' || mode === 'split') && (
          <div className={`flex-1 flex flex-col ${mode === 'split' ? 'border-r border-obsidian-border' : ''}`}>
            <textarea
              id="markdown-textarea"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full flex-1 p-3 bg-transparent font-mono text-[13px] text-obsidian-text focus:outline-none resize-none leading-relaxed placeholder:text-obsidian-dim"
              style={{ minHeight }}
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            className="flex-1 p-4 overflow-y-auto bg-[var(--t-bg)] markdown-body select-text"
            style={{ minHeight }}
          >
            {value.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith('#wikilink:')) {
                      const target = href.replace('#wikilink:', '');
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if (onWikilinkClick) onWikilinkClick(target);
                          }}
                          className="text-[var(--t-accent-strong)] hover:underline underline-offset-2 no-underline"
                        >
                          {children}
                        </button>
                      );
                    }
                    if (!isSafeUrl(href)) {
                      return <span className="text-obsidian-muted underline decoration-dotted" title="Untrusted link protocol">{children}</span>;
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {processedMarkdown}
              </ReactMarkdown>
            ) : (
              <p className="text-obsidian-dim italic text-xs">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
