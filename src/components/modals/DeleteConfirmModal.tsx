import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/common/Dialog';
import type { ProjectRemoveMode } from '@/types';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** mode is only set when diskChoice is on. */
  onConfirm: (mode?: ProjectRemoveMode) => void;
  title: string;
  itemName: string;
  filePathsToDelete?: string[];
  warningMessage?: string;
  /**
   * Desktop projects: let the user choose what happens to the files on disk.
   * Default is the safe option (keep the files).
   */
  diskChoice?: boolean;
}

const CHOICES: { mode: ProjectRemoveMode; title: string; text: string }[] = [
  {
    mode: 'keep',
    title: 'Remove from TRACE',
    text: 'The investigation disappears from TRACE; its files are kept in the workspace’s “removed” folder. You can bring it back with Import investigation → folder.',
  },
  {
    mode: 'trash',
    title: 'Remove from disk',
    text: 'The investigation’s folder is moved to the system Trash, so it can still be restored from there until the Trash is emptied.',
  },
];

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  filePathsToDelete = [],
  warningMessage,
  diskChoice = false,
}) => {
  const [mode, setMode] = useState<ProjectRemoveMode>('keep');
  useEffect(() => {
    if (isOpen) setMode('keep');
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={diskChoice ? 520 : 460}
      zIndex={75}
      footer={
        <>
          <button type="button" className="t-btn" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="t-btn !bg-rose-500/80 !border-rose-500/80 !text-white hover:!bg-rose-500"
            onClick={() => {
              onConfirm(diskChoice ? mode : undefined);
              onClose();
            }}
          >
            {diskChoice ? (mode === 'trash' ? 'Remove from disk' : 'Remove from TRACE') : 'Delete'}
          </button>
        </>
      }
    >
      <div className="p-3 space-y-3">
        {diskChoice ? (
          <>
            <p className="text-zinc-300 leading-relaxed">
              Remove <span className="text-zinc-50 font-medium">{itemName}</span>?
            </p>
            <div role="radiogroup" className="space-y-1.5">
              {CHOICES.map((c) => (
                <label
                  key={c.mode}
                  className={`flex items-start gap-2.5 p-2.5 rounded-[3px] border cursor-pointer ${
                    mode === c.mode ? 'border-[var(--t-accent)] bg-[var(--t-active)]' : 'border-[var(--t-border)] hover:bg-[var(--t-hover)]'
                  }`}
                >
                  <input type="radio" name="remove-mode" checked={mode === c.mode} onChange={() => setMode(c.mode)} className="mt-[3px]" />
                  <span className="min-w-0">
                    <span className="block text-zinc-100 font-medium">{c.title}</span>
                    <span className="block text-[11.5px] text-zinc-500 leading-snug mt-0.5">{c.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-zinc-300 leading-relaxed">
            Permanently delete <span className="text-zinc-50 font-medium">{itemName}</span>? This cannot be undone.
          </p>
        )}
        {warningMessage && <p className="text-amber-400 leading-relaxed">{warningMessage}</p>}
        {filePathsToDelete.length > 0 && (
          <div>
            <div className="t-label mb-1">{diskChoice ? 'Files affected' : 'Files removed'} ({filePathsToDelete.length})</div>
            <div className="bg-[var(--t-bg)] border border-[var(--t-border)] rounded-[3px] max-h-36 overflow-y-auto py-1 font-mono text-[11px] text-zinc-400">
              {filePathsToDelete.map((f) => (
                <div key={f} className="px-2 truncate" title={f}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
