import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { ReleaseNotes } from '@/components/common/ReleaseNotes';
import type { ReleaseInfo } from '@/services/updates/updateChecker';

/** Shown once after the app was updated to a new version. */
export const WhatsNewModal: React.FC<{ release: ReleaseInfo | null; onClose: () => void }> = ({ release, onClose }) => (
  <Dialog
    isOpen={!!release}
    onClose={onClose}
    title={`What’s new in ${release?.version ?? ''}`}
    subtitle={release?.publishedAt ? release.publishedAt.slice(0, 10) : undefined}
    width={620}
    footer={
      <>
        {release && (
          <a href={release.url} target="_blank" rel="noopener noreferrer" className="t-btn mr-auto">
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            View on GitHub
          </a>
        )}
        <button type="button" className="t-btn t-btn-primary !px-4" onClick={onClose}>
          Got it
        </button>
      </>
    }
  >
    <div className="px-4 py-3">
      {release?.notes?.trim() ? <ReleaseNotes markdown={release.notes} /> : <div className="text-zinc-500 text-[11.5px]">This release has no written notes.</div>}
    </div>
  </Dialog>
);
