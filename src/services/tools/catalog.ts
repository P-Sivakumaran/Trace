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

export type ToolId = 'sherlock' | 'maigret' | 'holehe' | 'ignorant' | 'dnsrecon' | 'dnstwist';
export type ToolInputKind = 'username' | 'email' | 'phone' | 'domain';
export type ToolCategory = 'Username' | 'Email' | 'Phone' | 'Domain';

export interface ToolSpec {
  id: ToolId;
  name: string;
  tagline: string;
  description: string;
  image: string;
  category: ToolCategory;
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
    image: 'https://avatars.githubusercontent.com/u/48293496?s=60&v=4',
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
    image: 'https://lh7-us.googleusercontent.com/sitesv-images-rt/APXyLQdbQX4-CQQgeiWo24lK8ZDLzeTN60AI_dKdbX9HFD7mzog3K4VsvLSRrtv4wi0h4oVVa6AgXTr3wdH6mjma-m_WcbY_hlXRH0IDtGK8mDCVwtt9T_Wn_Gs-ZCXUYlAtpLQsQORu8pe84gKKGfkUOE4NzplnHihPQohEvwwlZn7lwu2X0f4cNE57mJCjRUpylVr71pGG9dELILHKG8kSHqskKA',
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
    image: 'https://holehe.org/logo.png',
    category: 'Email',
    homepage: 'https://github.com/megadose/holehe',
    license: 'GPL-3.0',
    pip: { package: 'holehe', bin: 'holehe' },
    input: { kind: 'email', label: 'Email address', placeholder: 'name@example.com', entityTypes: ['email'] },
    durationHint: '< 1 min',
    timeoutSec: 300,
  },
  {
    id: 'ignorant',
    name: 'Ignorant',
    tagline: 'Check which services a phone number is registered on',
    description:
      'Uses the sign-up flows of services such as Instagram, Amazon and Snapchat to tell whether a phone number has an account there. Enter the number with its country code, e.g. “+1 2025550123”. Does not message or notify the number.',
    image: 'https://avatars.githubusercontent.com/u/51822495?s=60&v=4',
    category: 'Phone',
    homepage: 'https://github.com/megadose/ignorant',
    license: 'GPL-3.0',
    pip: { package: 'ignorant', bin: 'ignorant' },
    input: { kind: 'phone', label: 'Phone (+code number)', placeholder: '+1 2025550123', entityTypes: ['phone'] },
    durationHint: '< 1 min',
    timeoutSec: 300,
  },
  {
    id: 'dnsrecon',
    name: 'DNSRecon',
    tagline: 'DNS records, name servers and mail hosts of a domain',
    description:
      'Standard DNS enumeration: A, AAAA, NS, MX, CNAME and SRV records. Hosts and IP addresses become entities linked to the domain; TXT and SOA records are kept in the import source. Queries the domain’s public DNS only.',
    image: 'https://avatars.githubusercontent.com/u/521246?s=60&v=4',
    category: 'Domain',
    homepage: 'https://github.com/darkoperator/dnsrecon',
    license: 'GPL-2.0',
    pip: { package: 'dnsrecon', bin: 'dnsrecon' },
    input: { kind: 'domain', label: 'Domain', placeholder: 'example.com', entityTypes: ['domain', 'website'] },
    durationHint: '< 1 min',
    timeoutSec: 300,
  },
  {
    id: 'dnstwist',
    name: 'dnstwist',
    tagline: 'Find look-alike and typosquatting domains',
    description:
      'Generates permutations of a domain (typos, homoglyphs, added or swapped characters) and reports the ones that are actually registered, with their DNS records. Useful for spotting phishing and brand impersonation. Each registered look-alike becomes a candidate domain entity.',
    image: 'https://avatars.githubusercontent.com/u/8627380?s=60&v=4',
    category: 'Domain',
    homepage: 'https://github.com/elceef/dnstwist',
    license: 'Apache-2.0',
    pip: { package: 'dnstwist', bin: 'dnstwist' },
    input: { kind: 'domain', label: 'Domain', placeholder: 'example.com', entityTypes: ['domain', 'website'] },
    durationHint: '1–3 min',
    timeoutSec: 600,
  },
];

export function getToolSpec(id: unknown): ToolSpec | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PHONE_RE = /^\+(\d{1,3})\s+(\d[\d\s-]{3,14}\d)$/;
const EMAIL_RE = /^[A-Za-z0-9._%+][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

/**
 * Normalises and validates a tool input. Values can never start with "-",
 * so they cannot be mistaken for command-line flags.
 */
export function normaliseToolInput(kind: ToolInputKind, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = (raw || '').trim().replace(/^@/, '');
  if (kind === 'domain') {
    // Accept a URL or host:port and keep the hostname: "https://www.Example.com/a" → "www.example.com".
    const host = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase();
    return DOMAIN_RE.test(host) ? { ok: true, value: host } : { ok: false, error: 'Enter a domain name such as example.com.' };
  }
  if (kind === 'phone') {
    const m = PHONE_RE.exec(v);
    return m ? { ok: true, value: `+${m[1]} ${m[2].replace(/\D/g, '')}` } : { ok: false, error: 'Enter the country code, a space, then the number — e.g. +1 2025550123.' };
  }
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
    case 'ignorant': {
      const [cc, number] = value.split(' '); // "+1 2025550123" (already validated)
      return ['--only-used', '--no-color', '--no-clear', '-T', '10', cc, number];
    }
    case 'dnsrecon':
      return ['--lifetime', '5', '-d', value];
    case 'dnstwist':
      return ['--registered', '--format', 'json', '--threads', '20', value];
  }
}
