import React, { useState, useEffect } from 'react';
import { Note, ProjectData } from '@/types';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { Save, Trash2, FileText, X } from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  projectData: ProjectData;
  onSave: (note: Note) => void;
  onDelete: (noteId: string) => void;
  onOpenEntity: (entityId: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  projectData,
  onSave,
  onDelete,
  onOpenEntity,
}) => {
  const [draft, setDraft] = useState<Note>({ ...note });
  const [tagInput, setTagInput] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  useEffect(() => {
    setDraft({ ...note });
    setIsDirty(false);
  }, [note]);

  const updateDraft = (updates: Partial<Note>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(draft);
    setIsDirty(false);
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    if (!draft.tags.includes(tagInput.trim())) {
      updateDraft({ tags: [...draft.tags, tagInput.trim()] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    updateDraft({ tags: draft.tags.filter((t) => t !== tag) });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 h-[40px] shrink-0 flex items-center justify-between pl-4 pr-2 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
        <div className="flex items-center space-x-3">
          <div className="hidden">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10.5px] text-zinc-600">{draft.id}</span>
              {isDirty && (
                <span className="text-[10.5px] text-amber-400">
                  Unsaved changes
                </span>
              )}
            </div>
            <h1 className="text-[13.5px] font-semibold text-zinc-50 leading-tight">{draft.title}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className={`t-btn ${
              isDirty
                ? 't-btn-primary'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Note</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="t-icon-btn hover:!text-rose-400"
            title="Delete Note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 max-w-[980px] w-full space-y-5">
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Note Title *
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              className="t-input"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1.5 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="flex-1 px-3 py-1 bg-[var(--t-panel)] border border-obsidian-border rounded text-xs text-obsidian-text focus:outline-none focus:border-[var(--t-accent)]"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-2.5 py-1 text-xs bg-obsidian-hover hover:bg-[var(--t-hover)] text-obsidian-text border border-obsidian-border rounded"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <MarkdownEditor
            value={draft.markdownBody}
            onChange={(val) => updateDraft({ markdownBody: val })}
            onWikilinkClick={(target) => {
              const ent = projectData.entities.find((e) => e.id === target || e.name === target);
              if (ent) onOpenEntity(ent.id);
            }}
          />
        </div>
      </div>
    </div>
  );
};
