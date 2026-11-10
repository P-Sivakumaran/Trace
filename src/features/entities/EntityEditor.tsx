import React, { useState, useEffect, useRef } from 'react';
import {
  Entity,
  EntityType,
  ENTITY_TYPES,
  ProjectData,
} from '@/types';
import { EntityIcon, getEntityTypeColor } from '@/components/common/EntityIcon';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { StatusBadge } from '@/components/common/StatusBadge';
import { MapModal } from '@/components/modals/MapModal';
import {
  Save,
  Trash2,
  Plus,
  X,
  ArrowRight,
  Layers,
  MapPin,
  Upload,
  Image as ImageIcon,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { Select } from '@/components/common/Select';

interface EntityEditorProps {
  entity: Entity;
  projectData: ProjectData;
  onSave: (entity: Entity) => void;
  onDelete: (entityId: string) => void;
  onOpenEntity: (entityId: string) => void;
  onOpenRelationship: (relationshipId: string) => void;
  onCreateRelationship: (sourceId: string) => void;
  onShowInGraph: (entityId: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface AttributePreset {
  key: string;
  label: string;
  placeholder: string;
  category: string;
}

const ATTRIBUTE_PRESETS: AttributePreset[] = [
  { key: 'phone', label: 'Phone Number', placeholder: '+1 (555) 000-0000', category: 'Contact' },
  { key: 'email', label: 'Email Address', placeholder: 'subject@domain.com', category: 'Contact' },
  { key: 'address', label: 'Physical Address', placeholder: '123 Main St, City, Country', category: 'Location' },
  { key: 'location', label: 'City / Region', placeholder: 'London, United Kingdom', category: 'Location' },
  { key: 'coordinates', label: 'GPS Coordinates', placeholder: '51.5074° N, 0.1278° W', category: 'Location' },
  { key: 'website', label: 'Website URL', placeholder: 'https://example.com', category: 'Online' },
  { key: 'telegram', label: 'Telegram Handle', placeholder: '@username or channel', category: 'Social' },
  { key: 'twitter', label: 'Twitter / X', placeholder: '@handle', category: 'Social' },
  { key: 'ip', label: 'IP Address', placeholder: '192.168.1.1', category: 'Network' },
  { key: 'asn', label: 'Autonomous System', placeholder: 'AS12345', category: 'Network' },
  { key: 'passport', label: 'Passport / ID', placeholder: 'AB1234567', category: 'Identity' },
  { key: 'tax_id', label: 'Tax / Company Reg', placeholder: 'REG-98765432', category: 'Identity' },
  { key: 'date_of_birth', label: 'Date of Birth', placeholder: 'YYYY-MM-DD', category: 'Identity' },
  { key: 'employer', label: 'Employer / Organization', placeholder: 'Acme Corp', category: 'Work' },
  { key: 'job_title', label: 'Role / Job Title', placeholder: 'Lead Engineer / Director', category: 'Work' },
  { key: 'crypto_wallet', label: 'Crypto Wallet', placeholder: '0x... or bc1...', category: 'Finance' },
  { key: 'iban', label: 'IBAN / Bank Account', placeholder: 'GB29 XXXXX...', category: 'Finance' },
];

export const EntityEditor: React.FC<EntityEditorProps> = ({
  entity,
  projectData,
  onSave,
  onDelete,
  onOpenEntity,
  onOpenRelationship,
  onCreateRelationship,
  onShowInGraph,
  onDirtyChange,
}) => {
  const [draft, setDraft] = useState<Entity>({ ...entity });
  const [aliasInput, setAliasInput] = useState<string>('');
  const [tagInput, setTagInput] = useState<string>('');
  const [newAttrKey, setNewAttrKey] = useState<string>('');
  const [newAttrVal, setNewAttrVal] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Photo & Map modal state
  const [photoUrlInputOpen, setPhotoUrlInputOpen] = useState<boolean>(false);
  const [photoUrlValue, setPhotoUrlValue] = useState<string>('');
  const [mapModalOpen, setMapModalOpen] = useState<boolean>(false);
  const [mapLocationQuery, setMapLocationQuery] = useState<string>('');

  // Autocomplete dropdown state
  const [attrDropdownOpen, setAttrDropdownOpen] = useState<boolean>(false);
  const attrInputRef = useRef<HTMLInputElement>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft({ ...entity });
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [entity]);

  const updateDraft = (updates: Partial<Entity>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
    onDirtyChange?.(true);
  };

  const handleSave = () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName) return;
    onSave({ ...draft, name: trimmedName });
    setIsDirty(false);
    onDirtyChange?.(false);
  };

  // Photo handlers
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      updateDraft({
        attributes: {
          ...draft.attributes,
          photo: result,
        },
      });
    };
    reader.readAsDataURL(file);
    if (photoFileInputRef.current) photoFileInputRef.current.value = '';
  };

  const handleApplyPhotoUrl = () => {
    if (!photoUrlValue.trim()) return;
    updateDraft({
      attributes: {
        ...draft.attributes,
        photo: photoUrlValue.trim(),
      },
    });
    setPhotoUrlValue('');
    setPhotoUrlInputOpen(false);
  };

  const handleRemovePhoto = () => {
    const nextAttrs = { ...draft.attributes };
    delete nextAttrs.photo;
    delete nextAttrs.image;
    delete nextAttrs.avatar;
    updateDraft({ attributes: nextAttrs });
  };

  const entityPhoto = draft.attributes.photo || draft.attributes.image || draft.attributes.avatar;

  // Aliases & Tags
  const addAlias = () => {
    if (!aliasInput.trim()) return;
    if (!draft.aliases.includes(aliasInput.trim())) {
      updateDraft({ aliases: [...draft.aliases, aliasInput.trim()] });
    }
    setAliasInput('');
  };

  const removeAlias = (alias: string) => {
    updateDraft({ aliases: draft.aliases.filter((a) => a !== alias) });
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

  // Attributes
  const addAttribute = () => {
    if (!newAttrKey.trim()) return;
    updateDraft({
      attributes: {
        ...draft.attributes,
        [newAttrKey.trim()]: newAttrVal.trim(),
      },
    });
    setNewAttrKey('');
    setNewAttrVal('');
    setAttrDropdownOpen(false);
  };

  const selectAttrPreset = (preset: AttributePreset) => {
    setNewAttrKey(preset.key);
    setAttrDropdownOpen(false);
    if (!newAttrVal) {
      setNewAttrVal('');
    }
  };

  const removeAttribute = (key: string) => {
    const nextAttrs = { ...draft.attributes };
    delete nextAttrs[key];
    updateDraft({ attributes: nextAttrs });
  };

  const updateAttributeVal = (key: string, val: string) => {
    updateDraft({
      attributes: {
        ...draft.attributes,
        [key]: val,
      },
    });
  };

  // Filter attribute presets for Google-like dropdown
  const filteredPresets = ATTRIBUTE_PRESETS.filter((p) => {
    const query = newAttrKey.toLowerCase().trim();
    if (!query) return true;
    return (
      p.key.toLowerCase().includes(query) ||
      p.label.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
    );
  });

  // Check if an attribute is a location/address
  const isLocationAttribute = (key: string) => {
    const lk = key.toLowerCase();
    return (
      lk.includes('address') ||
      lk.includes('location') ||
      lk.includes('city') ||
      lk.includes('country') ||
      lk.includes('coord') ||
      lk.includes('geo')
    );
  };

  const openMapForLocation = (locationQuery: string) => {
    setMapLocationQuery(locationQuery);
    setMapModalOpen(true);
  };

  // Connected relationships
  const outgoingRels = projectData.relationships.filter((r) => r.source_entity === entity.id);
  const incomingRels = projectData.relationships.filter((r) => r.target_entity === entity.id);

  const getEntityName = (id: string) => {
    const found = projectData.entities.find((e) => e.id === id);
    return found ? found.name : id;
  };

  const color = getEntityTypeColor(draft.type);

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] overflow-y-auto">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-20 h-[40px] shrink-0 flex items-center justify-between pl-4 pr-2 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
        <div className="flex items-center space-x-3 min-w-0">
          {/* Avatar / Photo or Type Icon */}
          <div
            className="w-7 h-7 rounded-[3px] overflow-hidden flex items-center justify-center border shrink-0 relative group"
            style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color }}
          >
            {entityPhoto ? (
              <img src={entityPhoto} alt={draft.name} className="w-full h-full object-cover" />
            ) : (
              <EntityIcon type={draft.type} size={22} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10.5px] text-zinc-600 truncate">{draft.id}</span>
              {isDirty && (
                <span className="text-[10.5px] text-amber-400 shrink-0">
                  Unsaved changes
                </span>
              )}
            </div>
            <h1 className="text-[13.5px] font-semibold text-zinc-50 leading-tight truncate">{draft.name}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => onShowInGraph(draft.id)}
            className="t-btn"
          >
            <Layers className="w-3.5 h-3.5 opacity-70" />
            <span>Show in Graph</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || !draft.name.trim()}
            className={`t-btn ${
              isDirty && draft.name.trim()
                ? 't-btn-primary'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Entity</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="t-icon-btn hover:!text-rose-400"
            title="Delete Entity"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="px-6 py-4 max-w-[980px] w-full space-y-5">
        {/* Core Properties Card */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="t-label !text-zinc-400">Core Properties & Photo</h2>
            </div>

            {/* Photo Actions */}
            <div className="flex items-center gap-2">
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => photoFileInputRef.current?.click()}
                className="t-btn"
              >
                <Upload className="w-3.5 h-3.5 opacity-70" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setPhotoUrlInputOpen(!photoUrlInputOpen)}
                className="t-btn"
              >
                <ImageIcon className="w-3.5 h-3.5 opacity-70" />
                <span>Photo URL</span>
              </button>

              {entityPhoto && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/30 border border-rose-800/40 rounded-lg transition-colors"
                  title="Remove photo"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Photo URL Input Bar */}
          {photoUrlInputOpen && (
            <div className="flex items-center gap-2 p-2 bg-[var(--t-raised)] border border-obsidian-border rounded-lg">
              <input
                type="text"
                value={photoUrlValue}
                onChange={(e) => setPhotoUrlValue(e.target.value)}
                placeholder="Paste image URL (https://...)..."
                className="t-input flex-1"
              />
              <button
                type="button"
                onClick={handleApplyPhotoUrl}
                className="t-btn t-btn-primary"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setPhotoUrlInputOpen(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Display Name */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Enter entity name..."
                className={`t-input ${!draft.name.trim() ? '!border-rose-500/80 focus:!border-rose-500' : ''}`}
              />
              {!draft.name.trim() && (
                <p className="text-[11px] text-rose-400 mt-1">Name is required and cannot be empty.</p>
              )}
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Entity Type *
              </label>
              <Select
                value={draft.type}
                onChange={(e) => updateDraft({ type: e.target.value as EntityType })}
                className="t-input"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t.type} value={t.type} className="bg-[var(--t-raised)]">
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {draft.type === 'custom' && (
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Custom Type Label
              </label>
              <input
                type="text"
                value={draft.custom_type || ''}
                onChange={(e) => updateDraft({ custom_type: e.target.value })}
                placeholder="e.g. Crypto Wallet, Vehicle, Weapon..."
                className="t-input"
              />
            </div>
          )}

          {/* Quick Map Button if type is location */}
          {draft.type === 'location' && (
            <div className="p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-300 text-xs">
                <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                <span>This entity is a Location. View on interactive map:</span>
              </div>
              <button
                type="button"
                onClick={() => openMapForLocation(draft.name)}
                className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-md transition-colors"
              >
                Open Map
              </button>
            </div>
          )}

          {/* Aliases */}
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Aliases & Known Handles
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.aliases.map((alias) => (
                <span
                  key={alias}
                  className="px-2 py-0.5 rounded-full text-xs bg-[var(--t-hover)] border border-obsidian-border text-obsidian-text flex items-center space-x-1"
                >
                  <span>{alias}</span>
                  <button
                    type="button"
                    onClick={() => removeAlias(alias)}
                    className="hover:text-rose-400 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {draft.aliases.length === 0 && (
                <span className="text-xs text-obsidian-dim italic">No aliases defined yet</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Add alias (e.g. handle, username, former name)..."
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAlias())}
                className="t-input flex-1"
              />
              <button
                type="button"
                onClick={addAlias}
                className="t-btn shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-purple-950/60 border border-purple-800 text-purple-300 flex items-center space-x-1"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-rose-400 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {draft.tags.length === 0 && (
                <span className="text-xs text-obsidian-dim italic">No tags defined yet</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Add tag (e.g. priority, unverified, suspect)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="t-input flex-1"
              />
              <button
                type="button"
                onClick={addTag}
                className="t-btn shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Structured Attributes Section with Autocomplete & Map Integration */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Structured Attributes</h2>
            </div>
          </div>

          {/* Attribute rows */}
          <div className="space-y-2.5">
            {Object.entries(draft.attributes).map(([k, v]) => {
              if (k === 'photo' || k === 'image' || k === 'avatar') return null;
              const hasMap = isLocationAttribute(k);

              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="t-input w-1/3 flex items-center font-mono text-zinc-400 truncate">
                    {k}
                  </span>
                  <input
                    type="text"
                    value={String(v)}
                    onChange={(e) => updateAttributeVal(k, e.target.value)}
                    className="t-input flex-1"
                  />
                  {hasMap && String(v).trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => openMapForLocation(String(v))}
                      className="t-btn shrink-0 !text-rose-400 !border-rose-500/30"
                      title="View on Map"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Map</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttribute(k)}
                    className="p-1.5 text-obsidian-dim hover:text-rose-400 rounded-lg transition-colors shrink-0"
                    title="Remove attribute"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {Object.keys(draft.attributes).filter((k) => k !== 'photo' && k !== 'image' && k !== 'avatar').length === 0 && (
              <p className="text-xs text-obsidian-dim italic py-1">No custom attributes added yet.</p>
            )}
          </div>

          {/* Add attribute row with Google-search-like Autocomplete Dropdown */}
          <div className="relative pt-3 border-t border-obsidian-borderSubtle">
            <div className="flex items-center gap-2">
              <div className="relative w-1/3">
                <input
                  ref={attrInputRef}
                  type="text"
                  placeholder="Key (e.g. phone, address)..."
                  value={newAttrKey}
                  onFocus={() => setAttrDropdownOpen(true)}
                  onChange={(e) => {
                    setNewAttrKey(e.target.value);
                    setAttrDropdownOpen(true);
                  }}
                  className="t-input"
                />

                {/* Floating Autocomplete Dropdown */}
                {attrDropdownOpen && filteredPresets.length > 0 && (
                  <div className="absolute top-9 left-0 right-0 z-30 bg-[var(--t-raised)] border border-[var(--t-border)] rounded shadow-popover p-1 max-h-56 overflow-y-auto">
                    <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Attribute Presets</span>
                      <SlidersHorizontal className="w-3 h-3 opacity-70" />
                    </div>
                    {filteredPresets.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => selectAttrPreset(preset)}
                        className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-white/10 transition-colors text-xs group"
                      >
                        <div className="truncate">
                          <span className="font-mono text-purple-300 font-medium">{preset.key}</span>
                          <span className="text-zinc-400 text-[11px] ml-1.5 truncate">({preset.label})</span>
                        </div>
                        <span className="text-[9px] text-zinc-500 font-mono group-hover:text-zinc-300">
                          {preset.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder="Value..."
                value={newAttrVal}
                onChange={(e) => setNewAttrVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttribute())}
                className="t-input flex-1"
              />

              <button
                type="button"
                onClick={addAttribute}
                className="t-btn shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* Markdown Findings & Evidence Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Markdown Findings & Analysis</h2>
            </div>
          </div>
          <MarkdownEditor
            value={draft.markdownBody}
            onChange={(val) => updateDraft({ markdownBody: val })}
            onWikilinkClick={(target) => {
              const match = projectData.entities.find((e) => e.id === target || e.name === target);
              if (match) onOpenEntity(match.id);
            }}
          />
        </div>

        {/* Connected Relationships Section */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Connected Relationships</h2>
            </div>
            <button
              type="button"
              onClick={() => onCreateRelationship(draft.id)}
              className="t-btn t-btn-primary"
            >
              <Plus className="w-3 h-3" />
              <span>Add Relationship</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Outgoing */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-obsidian-muted uppercase flex items-center space-x-1.5">
                <ArrowRight className="w-3 h-3 opacity-70" />
                <span>Outgoing Claims ({outgoingRels.length})</span>
              </span>
              {outgoingRels.length > 0 ? (
                <div className="space-y-1.5">
                  {outgoingRels.map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => onOpenRelationship(rel.id)}
                      className="p-2.5 bg-[var(--t-panel)] hover:bg-obsidian-hover border border-obsidian-border rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="font-mono text-xs text-purple-300 font-medium">
                          {rel.type}
                        </span>{' '}
                        <span className="text-xs text-obsidian-muted">→</span>{' '}
                        <span className="text-xs text-obsidian-text font-medium">
                          {getEntityName(rel.target_entity)}
                        </span>
                      </div>
                      <StatusBadge status={rel.status} size="sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-obsidian-dim italic py-2">No outgoing claims</div>
              )}
            </div>

            {/* Incoming */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-obsidian-muted uppercase flex items-center space-x-1.5">
                <ArrowRight className="w-3 h-3 text-emerald-400 rotate-180" />
                <span>Incoming Claims ({incomingRels.length})</span>
              </span>
              {incomingRels.length > 0 ? (
                <div className="space-y-1.5">
                  {incomingRels.map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => onOpenRelationship(rel.id)}
                      className="p-2.5 bg-[var(--t-panel)] hover:bg-obsidian-hover border border-obsidian-border rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="text-xs text-obsidian-text font-medium">
                          {getEntityName(rel.source_entity)}
                        </span>{' '}
                        <span className="text-xs text-obsidian-muted">→</span>{' '}
                        <span className="font-mono text-xs text-purple-300 font-medium">
                          {rel.type}
                        </span>
                      </div>
                      <StatusBadge status={rel.status} size="sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-obsidian-dim italic py-2">No incoming claims</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Map Intelligence Modal */}
      <MapModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        locationQuery={mapLocationQuery}
        title={draft.name}
      />
    </div>
  );
};
