import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { EntityIcon, getEntityTypeColor, getEntityTypeLabel } from '@/components/common/EntityIcon';
import type { ProjectData } from '@/types';
import { IMPORT_ADAPTERS, detectAdapter } from '@/services/import/adapters';
import type { ImportBatch } from '@/services/import/types';
import { buildImportRecords, planImport, type EntityDecision, type ImportPlan, type ImportRecords } from '@/services/import/plan';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData | null;
  /** Persists the approved records. Must only create, never overwrite. */
  onCommit: (records: ImportRecords) => Promise<void>;
  /** Pre-parsed batch (e.g. output of a tool run) — skips the file step. */
  initialBatch?: ImportBatch | null;
}

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Import external tool output (SpiderFoot, CSV, indicator lists, TRACE import
 * JSON) into the open case — with a review step before anything is written.
 */
export const ImportDataModal: React.FC<ImportDataModalProps> = ({ isOpen, onClose, projectData, onCommit, initialBatch }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [adapterId, setAdapterId] = useState<string>('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen && initialBatch && projectData) {
      setPlan(planImport(initialBatch, projectData));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialBatch]);

  const reset = () => {
    setFile(null);
    setPlan(null);
    setError(null);
    setAdapterId('');
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => {
    reset();
    onClose();
  };

  const runAdapter = (name: string, text: string, id: string) => {
    if (!projectData) return;
    const adapter = IMPORT_ADAPTERS.find((a) => a.id === id) ?? detectAdapter(name, text);
    try {
      const batch = adapter.parse(text, name);
      setPlan(planImport(batch, projectData));
      setError(null);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError('File is larger than 20 MB.');
      return;
    }
    const text = await f.text();
    const adapter = detectAdapter(f.name, text);
    setFile({ name: f.name, text });
    setAdapterId(adapter.id);
    runAdapter(f.name, text, adapter.id);
  };

  const setDecision = (idx: number, decision: EntityDecision) => {
    if (!plan) return;
    setPlan({ ...plan, entities: plan.entities.map((p, i) => (i === idx ? { ...p, decision } : p)) });
  };

  const stats = useMemo(() => {
    if (!plan) return null;
    return {
      create: plan.entities.filter((p) => p.decision === 'create').length,
      link: plan.entities.filter((p) => p.decision === 'link-existing').length,
      skip: plan.entities.filter((p) => p.decision === 'skip').length,
      dups: plan.entities.filter((p) => p.duplicateOf).length,
      rels: plan.relationships.filter((r) => r.decision === 'create').length,
      relDups: plan.relationships.filter((r) => r.duplicateOf).length,
    };
  }, [plan]);

  const commit = async () => {
    if (!plan || !projectData || busy) return;
    setBusy(true);
    try {
      const existingIds = new Set<string>([
        ...projectData.entities.map((e) => e.id),
        ...projectData.relationships.map((r) => r.id),
        ...projectData.sources.map((s) => s.id),
      ]);
      await onCommit(buildImportRecords(plan, { existingIds }));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title={initialBatch ? `Review ${initialBatch.tool} results` : 'Import tool output'}
      subtitle={initialBatch ? initialBatch.fileName : file ? file.name : 'Review before adding to the case'}
      width={760}
      footer={
        <>
          {stats && (
            <span className="mr-auto text-[11px] text-zinc-500">
              {stats.create} new · {stats.link} linked to existing · {stats.skip} skipped · {stats.rels} relationships
            </span>
          )}
          <button type="button" className="t-btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="t-btn t-btn-primary" disabled={!plan || busy || (stats?.create === 0 && stats?.rels === 0)} onClick={commit}>
            {busy ? 'Importing…' : 'Import into case'}
          </button>
        </>
      }
    >
      {!initialBatch && <div className="px-3 py-2.5 border-b border-[var(--t-border-subtle)] flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".json,.csv,.txt,.lst,.list" className="hidden" onChange={onFile} />
        <button type="button" className="t-btn" onClick={() => fileRef.current?.click()}>
          <FileUp className="w-3.5 h-3.5 opacity-70" />
          {file ? 'Choose another file' : 'Choose file'}
        </button>
        {file && (
          <>
            <span className="text-zinc-500 text-[11px]">Format</span>
            <select
              value={adapterId}
              onChange={(e) => {
                setAdapterId(e.target.value);
                runAdapter(file.name, file.text, e.target.value);
              }}
              className="t-input !h-[24px] !py-0 !w-auto"
            >
              {IMPORT_ADAPTERS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </>
        )}
        {!file && <span className="text-[11px] text-zinc-500">SpiderFoot CSV, CSV with type/value columns, indicator list (.txt) or TRACE import JSON</span>}
      </div>}

      {error && (
        <div className="mx-3 my-2 px-2.5 py-2 rounded-[3px] border border-rose-500/30 bg-rose-950/20 text-rose-300 text-[11.5px]">{error}</div>
      )}

      {plan && stats && (
        <div className="text-[11.5px]">
          <div className="px-3 py-2 text-zinc-400 border-b border-[var(--t-border-subtle)] space-y-0.5">
            <div>
              Tool <span className="text-zinc-200">{plan.batch.tool}</span> · {plan.batch.entities.length} entities, {plan.batch.relationships.length} relationships.
              Imported records are tagged <span className="font-mono text-zinc-300">imported</span>, keep their original data and are linked to one import source.
              New relationships start as <span className="text-zinc-300">Candidate</span>.
            </div>
            {stats.dups > 0 && <div className="text-amber-400/90">{stats.dups} possible duplicate(s) of existing entities — existing records are never overwritten.</div>}
            {stats.relDups > 0 && <div className="text-zinc-500">{stats.relDups} relationship(s) already exist and will be skipped.</div>}
            {plan.batch.unmapped.length > 0 && (
              <div className="flex items-center gap-1 text-zinc-500">
                <AlertTriangle className="w-3 h-3 text-amber-400/80" />
                {plan.batch.unmapped.length} record(s) could not be mapped; they are preserved in the import source.
              </div>
            )}
            {plan.batch.warnings.map((w, i) => (
              <div key={i} className="text-zinc-500">{w}</div>
            ))}
          </div>

          <div className="max-h-[42vh] overflow-y-auto">
            {plan.entities.length === 0 && <div className="px-3 py-3 text-zinc-500">No entities could be mapped from this file.</div>}
            {plan.entities.map((p, i) => (
              <div key={p.item.key + i} className="flex items-center gap-2 px-3 h-[28px] border-b border-[var(--t-border-subtle)] hover:bg-[var(--t-hover)]">
                <span style={{ color: getEntityTypeColor(p.item.type) }} className="shrink-0">
                  <EntityIcon type={p.item.type} className="w-3.5 h-3.5" />
                </span>
                <span className="w-[92px] shrink-0 text-zinc-500 truncate">{getEntityTypeLabel(p.item.type)}</span>
                <span className="flex-1 min-w-0 truncate text-zinc-200" title={p.item.name}>{p.item.name}</span>
                {p.duplicateOf && (
                  <span className="shrink-0 max-w-[200px] truncate text-amber-400/90" title={`Matches existing "${p.duplicateOf.name}" by ${p.duplicateOf.matchedOn}`}>
                    ≈ {p.duplicateOf.name}
                  </span>
                )}
                <select
                  value={p.decision}
                  onChange={(e) => setDecision(i, e.target.value as EntityDecision)}
                  className="t-input !h-[22px] !py-0 !w-[132px] shrink-0"
                >
                  <option value="create">Create new</option>
                  {p.duplicateOf && <option value="link-existing">Use existing</option>}
                  <option value="skip">Skip</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
};
