import React from 'react';
import { Dialog } from '@/components/common/Dialog';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  filePathsToDelete?: string[];
  warningMessage?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  filePathsToDelete = [],
  warningMessage,
}) => (
  <Dialog
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    width={460}
    footer={
      <>
        <button type="button" className="t-btn" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button
          type="button"
          className="t-btn !bg-rose-500/80 !border-rose-500/80 !text-white hover:!bg-rose-500"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Delete
        </button>
      </>
    }
  >
    <div className="p-3 space-y-3">
      <p className="text-zinc-300 leading-relaxed">
        Permanently delete <span className="text-zinc-50 font-medium">{itemName}</span>? This cannot be undone.
      </p>
      {warningMessage && <p className="text-amber-400 leading-relaxed">{warningMessage}</p>}
      {filePathsToDelete.length > 0 && (
        <div>
          <div className="t-label mb-1">Files removed ({filePathsToDelete.length})</div>
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
