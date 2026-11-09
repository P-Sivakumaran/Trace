/**
 * Entity-type glyphs for graph nodes (GitHub issue #1).
 *
 * The canvas reuses the exact same lucide icons as the rest of the UI
 * (EntityIcon), rendered once per type into an SVG data URI that Cytoscape
 * can paint as a node background image. Results are cached per type.
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { EntityIcon } from '@/components/common/EntityIcon';
import { ENTITY_TYPES } from '@/types';

/** Dark glyph on the muted node fill reads better than white at small sizes. */
export const GRAPH_ICON_COLOR = '#101114';

const cache = new Map<string, string>();

/** Turns an <svg> string into a data URI usable as a Cytoscape background-image. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Normalises rendered lucide markup: drops React/lucide class names and forces
 * explicit size + stroke colour (an <img>-style render has no CSS context).
 */
export function normaliseIconSvg(svg: string, color = GRAPH_ICON_COLOR): string {
  return svg
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\sstroke="currentColor"/g, ` stroke="${color}"`)
    .replace(/\swidth="[^"]*"/, ' width="24"')
    .replace(/\sheight="[^"]*"/, ' height="24"')
    .replace(/<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function renderIcon(type: string): string {
  try {
    if (typeof document === 'undefined') return '';
    const host = document.createElement('div');
    const root = createRoot(host);
    flushSync(() => root.render(<EntityIcon type={type} size={24} strokeWidth={2} className="" />));
    const svg = host.innerHTML;
    root.unmount();
    return svg.startsWith('<svg') ? svgToDataUri(normaliseIconSvg(svg)) : '';
  } catch {
    return '';
  }
}

// Rendered eagerly at module load: flushSync must not run inside a React render
// (the graph builds its elements inside useMemo).
for (const t of ENTITY_TYPES) cache.set(t.type, renderIcon(t.type));

/**
 * Data URI for an entity type's glyph. Unknown / user-defined types fall back
 * to the "custom" glyph. Returns '' when rendering is unavailable (tests).
 */
export function graphIconFor(type: string): string {
  return cache.get(type) ?? cache.get('custom') ?? '';
}
