/**
 * Marketplace catalog of external OSINT tools TRACE can install and run.
 *
 * Shared by the Electron main process (which builds the exact command line —
 * the renderer can only pass a catalog id and a validated input value) and the
 * renderer (which shows the catalog and parses the output into an import batch).
 *
 * Every tool is installed from PyPI into its own virtual environment under the
 * app's data folder; nothing is installed system-wide.
 */
import type { EntityType } from '@/types';

export type ToolId = 'sherlock' | 'maigret' | 'holehe';
export type ToolInputKind = 'username' | 'email';

export interface ToolSpec {
  id: ToolId;
  name: string;
  tagline: string;
  description: string;
  category: 'Username' | 'Email';
  homepage: string;
  license: string;
  /** PyPI package and console script it installs. */
  pip: { package: string; bin: string };
  input: {
    kind: ToolInputKind;
    label: string;
    placeholder: string;
    /** Entity types whose name can be used as the input. */
    entityTypes: EntityType[];
  };
  /** Rough duration hint shown before running. */
  durationHint: string;
  /** Hard limit; the run is killed after this many seconds. */
  timeoutSec: number;
}

export const TOOL_CATALOG: ToolSpec[] = [
  {
    id: 'sherlock',
    name: 'Sherlock',
    tagline: 'Find a username across 400+ social networks',
    description:
      'Checks which websites have an account with the given username. Each hit becomes a candidate account linked to the target entity.',
    category: 'Username',
    homepage: 'https://github.com/sherlock-project/sherlock',
    license: 'MIT',
    pip: { package: 'sherlock-project', bin: 'sherlock' },
    input: { kind: 'username', label: 'Username', placeholder: 'e.g. johndoe', entityTypes: ['account', 'person'] },
    durationHint: '1–3 min',
    timeoutSec: 600,
  },
  {
    id: 'maigret',
    name: 'Maigret',
    tagline: 'Username dossier from 3000+ sites with profile data',
    description:
      'Searches the top 500 sites for the username and extracts profile details (full name, location, links, IDs) where the site exposes them. Extracted fields are kept as attributes.',
    category: 'Username',
    homepage: 'https://github.com/soxoj/maigret',
    license: 'MIT',
    pip: { package: 'maigret', bin: 'maigret' },
    input: { kind: 'username', label: 'Username', placeholder: 'e.g. johndoe', entityTypes: ['account', 'person'] },
    durationHint: '2–5 min',
    timeoutSec: 900,
  },
  {
    id: 'holehe',
    name: 'Holehe',
    tagline: 'Check which services an email is registered on',
    description:
      'Uses sign-up and login flows of 120+ services to tell whether an email address has an account there. Runs with password-recovery checks disabled, so the target is not notified.',
    category: 'Email',
    homepage: 'https://github.com/megadose/holehe',
    license: 'GPL-3.0',
    pip: { package: 'holehe', bin: 'holehe' },
    input: { kind: 'email', label: 'Email address', placeholder: 'name@example.com', entityTypes: ['email'] },
    durationHint: '< 1 min',
    timeoutSec: 300,
  },
];

export function getToolSpec(id: unknown): ToolSpec | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

/**
 * Normalises and validates a tool input. Values can never start with "-",
 * so they cannot be mistaken for command-line flags.
 */
export function normaliseToolInput(kind: ToolInputKind, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = (raw || '').trim().replace(/^@/, '');
  if (kind === 'username') {
    return USERNAME_RE.test(v) ? { ok: true, value: v } : { ok: false, error: 'Usernames may contain letters, digits, ".", "_" and "-" (max 64).' };
  }
  return EMAIL_RE.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: 'Enter a valid email address.' };
}

/** Exact argv (after the executable) for a validated input. */
export function buildToolArgs(spec: ToolSpec, value: string): string[] {
  switch (spec.id) {
    case 'sherlock':
      return ['--print-found', '--no-color', '--timeout', '15', value];
    case 'maigret':
      return ['--no-color', '--no-progressbar', '--timeout', '20', '--top-sites', '500', value];
    case 'holehe':
      return ['--only-used', '--no-color', '--no-clear', '-NP', '-T', '10', value];
  }
}
