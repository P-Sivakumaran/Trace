import React from 'react';
import { RelationshipStatus, RELATIONSHIP_STATUSES } from '@/types';

interface StatusBadgeProps {
  status: RelationshipStatus;
  size?: 'sm' | 'md';
  /** Show only the coloured mark (for dense rows). */
  compact?: boolean;
}

/**
 * Verification status: a line-style glyph in the status colour plus label.
 * The glyph mirrors how the relationship is drawn on the graph
 * (solid / dashed / dotted), so the same visual language is used everywhere.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', compact }) => {
  const c = RELATIONSHIP_STATUSES.find((s) => s.status === status) || RELATIONSHIP_STATUSES[3];
  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 ${size === 'sm' ? 'text-[10.5px]' : 'text-[11.5px]'}`}
      style={{ color: c.color }}
      title={c.label}
    >
      <StatusGlyph status={status} />
      {!compact && <span>{c.label}</span>}
    </span>
  );
};

export const StatusGlyph: React.FC<{ status: RelationshipStatus; width?: number }> = ({ status, width = 12 }) => {
  const c = RELATIONSHIP_STATUSES.find((s) => s.status === status) || RELATIONSHIP_STATUSES[3];
  const dash = c.borderStyle === 'dashed' ? '3 2' : c.borderStyle === 'dotted' ? '1 2' : undefined;
  return (
    <svg width={width} height="6" viewBox={`0 0 ${width} 6`} className="shrink-0" aria-hidden>
      <line x1="0" y1="3" x2={width} y2="3" stroke={c.color} strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
};
