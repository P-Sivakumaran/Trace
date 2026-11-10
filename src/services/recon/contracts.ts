import { z } from 'zod';
import { parse } from 'tldts';

export const recordId = z.string().min(1).max(180).regex(/^[A-Za-z0-9_.-]+$/).refine((s) => s !== '.' && s !== '..');
export function normalizeDomain(input: string): string {
  const text = input.trim().replace(/\.$/, '').toLowerCase();
  if (!text || /[\s/@:#?%*\\]/.test(text)) throw new Error('Enter a hostname, not a URL, address range or command');
  const hostname = new URL(`https://${text}`).hostname;
  if (hostname.length > 253 || hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('Invalid domain');
  const info = parse(hostname, { allowPrivateDomains: true });
  if (!info.domain || (!info.isIcann && !info.isPrivate) || info.isIp) throw new Error('A registrable public domain is required');
  return hostname;
}
export const domainSchema = z.string().max(253).transform((value, ctx) => {
  try { return normalizeDomain(value); } catch (error) { ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid domain' }); return z.NEVER; }
});
export function withinScope(target: string, scope: string[]): boolean {
  return scope.some((root) => target === root || target.endsWith(`.${root}`));
}
export const operationSchema = z.enum(['certificate_transparency', 'theharvester_crtsh']);
export const reconConfigSchema = z.object({
  mode: z.enum(['local', 'ssh']),
  scope: z.array(domainSchema).min(1).max(30),
  sshHost: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/).optional(),
  sshUser: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/).optional(),
  remoteServer: z.string().regex(/^\/[A-Za-z0-9_./-]+\.js$/).optional(),
}).strict().superRefine((config, ctx) => {
  if (config.mode === 'ssh' && (!config.sshHost || !config.sshUser || !config.remoteServer)) ctx.addIssue({ code: 'custom', message: 'SSH host, user and absolute runner path are required' });
});
export type ReconConfig = z.infer<typeof reconConfigSchema>;
export const runnerHealthSchema = z.object({
  name: z.string(), version: z.string(), platform: z.string(), kali: z.boolean(),
  synthetic: z.boolean(), scope: z.array(domainSchema), operations: z.array(operationSchema),
  harvesterVersion: z.string().nullable(),
});
export type RunnerHealth = z.infer<typeof runnerHealthSchema>;
export const collectionSchema = z.object({
  target: domainSchema, operation: operationSchema, collectedAt: z.iso.datetime(),
  toolVersion: z.string().max(500), sourceUrl: z.string().url().max(2000),
  domains: z.array(domainSchema).max(500), raw: z.string().max(4_000_000),
  synthetic: z.boolean(),
}).strict();
export type Collection = z.infer<typeof collectionSchema>;
export const startJobSchema = z.object({ caseId: recordId, target: domainSchema, operation: operationSchema }).strict();
export const proposalSchema = z.object({ target: domainSchema, domains: z.array(domainSchema).min(1).max(100), summary: z.string().min(1).max(4000) }).strict();
export type ReconJob = {
  id: string; caseId: string; target: string; operation: z.infer<typeof operationSchema> | 'assistant_proposal';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'imported';
  createdAt: string; finishedAt?: string; error?: string; rawHash?: string;
  domains: string[]; selectedDomains?: string[]; sourceId?: string; synthetic?: boolean;
  sourceUrl?: string; toolVersion?: string; collectedAt?: string;
};
export function validateCollection(input: unknown, target: string, operation: string): Collection {
  const result = collectionSchema.parse(input);
  if (result.target !== target || result.operation !== operation || !result.sourceUrl.startsWith('https://crt.sh/')) throw new Error('Runner returned mismatched collection provenance');
  if (result.domains.some((domain) => !withinScope(domain, [target]))) throw new Error('Runner returned out-of-scope domains');
  result.domains = [...new Set(result.domains)].sort();
  return result;
}

export type ReconProposal = z.infer<typeof proposalSchema> & { id: string; caseId: string; createdAt: string };
export interface ReconApi {
  getConfig(): Promise<ReconConfig | null>;
  saveConfig(config: ReconConfig): Promise<ReconConfig>;
  health(): Promise<unknown>;
  readArtifact(caseId: string, id: string): Promise<{ raw: string; sha256: string }>;
  listJobs(caseId: string): Promise<ReconJob[]>;
  startJob(request: z.infer<typeof startJobSchema>): Promise<ReconJob>;
  cancelJob(caseId: string, id: string): Promise<void>;
  acceptJob(caseId: string, id: string, domains: string[]): Promise<ReconJob>;
  listProposals(caseId: string): Promise<ReconProposal[]>;
  stageProposal(caseId: string, id: string): Promise<ReconJob>;
  caseMcpConfig(caseId: string): Promise<unknown>;
}
