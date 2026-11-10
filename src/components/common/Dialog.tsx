import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** short context line shown after the title */
  subtitle?: React.ReactNode;
  width?: number;
  /** Stacking level; raise above other dialogs (e.g. a confirmation opened from Settings). */
  zIndex?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** Standard modal dialog: 32px title bar, scrolling body, optional footer. */
export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, subtitle, width = 520, zIndex = 70, footer, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-start justify-center pt-[12vh] p-4 bg-black/55" style={{ zIndex }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-[var(--t-panel)] border border-[#2e2f34] rounded-[4px] w-full flex flex-col max-h-[76vh] shadow-popover text-[12px]"
        style={{ maxWidth: width }}
      >
        <div className="h-[32px] shrink-0 flex items-center gap-2 pl-3 pr-1.5 border-b border-[var(--t-border)]">
          <span className="text-[12.5px] font-semibold text-zinc-100 truncate">{title}</span>
          {subtitle && <span className="text-[11.5px] text-zinc-500 truncate">{subtitle}</span>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="t-icon-btn" title="Close  (Esc)">
            <X />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="h-[40px] shrink-0 flex items-center justify-end gap-1.5 px-3 border-t border-[var(--t-border)]">{footer}</div>
        )}
      </div>
    </div>
  );
};

/** A labelled settings/form row: label column + control column. */
export const FieldRow: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="grid grid-cols-[150px_1fr] gap-3 px-3 py-2 border-b border-[var(--t-border-subtle)] last:border-b-0 items-start">
    <div className="pt-[4px]">
      <div className="text-zinc-300">{label}</div>
      {hint && <div className="text-[11px] text-zinc-600 leading-snug mt-0.5">{hint}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

export const DialogSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <div className="h-[26px] flex items-center px-3 bg-[var(--t-bg)] border-y border-[var(--t-border)] first:border-t-0">
      <span className="t-label">{title}</span>
    </div>
    {children}
  </section>
);

/** Close-on-Escape for modals that manage their own markup. */
export function useEscapeKey(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
}
