import React, { useState, useRef } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { Entity, EntityType, ENTITY_TYPES } from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import { X, Plus, Upload, Image as ImageIcon } from 'lucide-react';

interface NewEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (entity: Entity) => void;
  defaultType?: EntityType;
}

export const NewEntityModal: React.FC<NewEntityModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  defaultType = 'person',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>(defaultType);
  const [customType, setCustomType] = useState('');
  const [aliasesStr, setAliasesStr] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [showPhotoUrlInput, setShowPhotoUrlInput] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const now = new Date().toISOString();
    const id = `ent-${Date.now().toString(36)}`;
    const aliases = aliasesStr
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    const tags = tagsStr
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    const finalPhoto = photoDataUrl || photoUrl.trim() || undefined;

    const newEntity: Entity = {
      id,
      type,
      name: name.trim(),
      aliases,
      tags,
      custom_type: type === 'custom' ? customType.trim() : undefined,
      attributes: finalPhoto ? { photo: finalPhoto } : {},
      created_at: now,
      updated_at: now,
      markdownBody: `# ${name.trim()}\n\n## Summary\n\nAdd investigative summary for ${name.trim()}.\n\n## Findings\n\nDocument observations.\n\n## Sources\n\nAdd reference links.`,
    };

    onCreate(newEntity);
    setName('');
    setAliasesStr('');
    setTagsStr('');
    setPhotoDataUrl('');
    setPhotoUrl('');
    setShowPhotoUrlInput(false);
    onClose();
  };

  const activePhoto = photoDataUrl || photoUrl.trim();

  return (
    <div className="fixed inset-0 z-[70] bg-black/65 flex items-center justify-center p-4">
      <div className="bg-[var(--t-panel)] border border-[#2e2f34] rounded-[4px] max-w-md w-full shadow-popover overflow-hidden text-[12px] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-[32px] flex items-center justify-between pl-3 pr-1.5 border-b border-[var(--t-border)]">
          <div className="flex items-center space-x-2 font-semibold text-obsidian-text">
            <Plus className="w-4 h-4 text-obsidian-accent" />
            <span>Create New Investigation Entity</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="t-icon-btn-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1.5">
              Entity Type *
            </label>
            <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto p-1 bg-[var(--t-panel)] border border-obsidian-border rounded-lg">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setType(t.type)}
                  className={`flex items-center space-x-1.5 p-1.5 rounded-md text-left transition-colors ${
                    type === t.type
                      ? 'bg-obsidian-accent text-white font-medium shadow-sm'
                      : 'hover:bg-obsidian-hover text-obsidian-muted'
                  }`}
                >
                  <EntityIcon type={t.type} className="w-3 h-3 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {type === 'custom' && (
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Custom Type Label *
              </label>
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="e.g. Cryptocurrency Wallet, Vehicle, Weapon..."
                className="w-full px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-obsidian-text focus:outline-none focus:border-[var(--t-accent)]"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Display Name *
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe, nightmarket-vault.cc, 185.220.101.45..."
              className="t-input"
              required
            />
          </div>

          {/* Photo / Avatar Uploader */}
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Entity Photo / Avatar (Optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              {activePhoto ? (
                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/20 shrink-0">
                  <img src={activePhoto} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl('');
                      setPhotoUrl('');
                    }}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center text-rose-300 opacity-0 hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 bg-[var(--t-panel)] hover:bg-[var(--t-hover)] text-zinc-300 border border-obsidian-border rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <Upload className="w-3 h-3 opacity-70" />
                <span>Upload</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPhotoUrlInput(!showPhotoUrlInput)}
                className="px-2.5 py-1.5 bg-[var(--t-panel)] hover:bg-[var(--t-hover)] text-zinc-300 border border-obsidian-border rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <ImageIcon className="w-3 h-3 opacity-70" />
                <span>URL</span>
              </button>
            </div>

            {showPhotoUrlInput && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Paste image link (https://...)..."
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  className="flex-1 px-2.5 py-1 bg-[var(--t-bg)] border border-obsidian-border rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Aliases (comma separated)
            </label>
            <input
              type="text"
              value={aliasesStr}
              onChange={(e) => setAliasesStr(e.target.value)}
              placeholder="e.g. handle_99, moroz_dev, alternative_name"
              className="w-full px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-obsidian-text focus:outline-none focus:border-[var(--t-accent)]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. priority, suspect, unverified"
              className="w-full px-3 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-obsidian-text focus:outline-none focus:border-[var(--t-accent)]"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-obsidian-border">
            <button
              type="button"
              onClick={onClose}
              className="t-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="t-btn t-btn-primary shadow-sm"
            >
              Create Entity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
