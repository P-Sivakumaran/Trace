import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { dump, load } from 'js-yaml';
import { z } from 'zod';
import { reconConfigSchema, startJobSchema, validateCollection, withinScope, domainSchema, recordId, proposalSchema, type ReconConfig, type ReconJob } from '../../src/services/recon/contracts.js';
import { atomicJson, caseDirectory, inside, readText } from './paths.js';
import { callRunner } from './client.js';

type RunnerCall = typeof callRunner;
function record(text: string): Record<string, unknown> {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return front ? z.record(z.string(), z.unknown()).parse(load(front[1])) : {};
}
function markdown(data: Record<string, unknown>, body: string): string { return `---\n${dump(data, { noRefs: true })}---\n\n${body}\n`; }
const jobSchema = z.object({ id: recordId, caseId: recordId, target: domainSchema, operation: z.enum(['certificate_transparency', 'theharvester_crtsh', 'assistant_proposal']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'imported']), createdAt: z.iso.datetime(),
  domains: z.array(domainSchema).max(500), rawHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  finishedAt: z.string().optional(), error: z.string().max(500).optional(), selectedDomains: z.array(domainSchema).optional(), sourceId: recordId.optional(), synthetic: z.boolean().optional(),
  sourceUrl: z.string().optional(), toolVersion: z.string().optional(), collectedAt: z.string().optional(),
}).strict();

export class ReconBroker {
  private pending: { job: ReconJob; root: string; config: ReconConfig; controller: AbortController }[] = [];
  private running = new Map<string, AbortController>();
  constructor(private options: { workspace: () => string; profile: string; localServer: string; nodeExecutable: string; call?: RunnerCall; fixture?: boolean }) {}

  config(): ReconConfig | null {
    const file = path.join(this.options.profile, 'recon-config.json');
    if (!fs.existsSync(file)) return null;
    return reconConfigSchema.parse(JSON.parse(readText(this.options.profile, 'recon-config.json')));
  }
  saveConfig(input: unknown): ReconConfig {
    const config = reconConfigSchema.parse(input);
    if (JSON.stringify(this.config()) !== JSON.stringify(config)) this.stop();
    atomicJson(this.options.profile, 'recon-config.json', config);
    return config;
  }
  async health(): Promise<unknown> {
    const config = this.config(); if (!config) throw new Error('Configure a runner and domain scope first');
    return (this.options.call ?? callRunner)(config, this.options.localServer, this.options.nodeExecutable, 'runner_health', {}, AbortSignal.timeout(15_000), this.options.fixture);
  }
  private persist(root: string, job: ReconJob) { atomicJson(root, `.trace/recon/jobs/${job.id}/manifest.json`, job); }
  private read(caseId: string, id: string): { job: ReconJob; root: string } {
    const root = caseDirectory(this.options.workspace(), caseId);
    const job = jobSchema.parse(JSON.parse(readText(root, `.trace/recon/jobs/${recordId.parse(id)}/manifest.json`)));
    if (job.caseId !== caseId || job.id !== id) throw new Error('Case/job identity mismatch');
    return { job, root };
  }
  list(caseId: string): ReconJob[] {
    const root = caseDirectory(this.options.workspace(), caseId);
    const directory = inside(root, path.join(root, '.trace/recon/jobs'));
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((id) => recordId.safeParse(id).success).slice(-1000).flatMap((id) => {
      try {
        const { job } = this.read(caseId, id);
        if (['queued', 'running'].includes(job.status) && !this.running.has(id) && !this.pending.some((entry) => entry.job.id === id)) {
          job.status = 'failed'; job.error = 'Interrupted by application shutdown; run again explicitly.'; this.persist(root, job);
        }
        return [job];
      } catch { return []; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  }
  start(input: unknown): ReconJob {
    const request = startJobSchema.parse(input);
    const config = this.config(); if (!config) throw new Error('Configure a runner first');
    if (!withinScope(request.target, config.scope)) throw new Error('Target is outside the configured domain scope');
    if (this.pending.length + this.running.size >= 5) throw new Error('The job queue is full');
    const root = caseDirectory(this.options.workspace(), request.caseId);
    const job: ReconJob = { ...request, id: randomUUID(), status: 'queued', domains: [], createdAt: new Date().toISOString() };
    this.persist(root, job);
    this.pending.push({ job, root, config, controller: new AbortController() });
    queueMicrotask(() => this.pump());
    return { ...job };
  }
  private pump() {
    if (this.running.size || !this.pending.length) return;
    const entry = this.pending.shift()!;
    this.running.set(entry.job.id, entry.controller);
    void this.execute(entry).catch(() => { /* Disk failure remains visible on the next manifest read; never leave an unhandled rejection. */ }).finally(() => { this.running.delete(entry.job.id); this.pump(); });
  }
  private async execute(entry: { job: ReconJob; root: string; config: ReconConfig; controller: AbortController }) {
    const { job, root, config, controller } = entry;
    try {
      job.status = 'running'; this.persist(root, job);
      const result = await (this.options.call ?? callRunner)(config, this.options.localServer, this.options.nodeExecutable,
        'kali_collect_domain', { target: job.target, operation: job.operation }, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]), this.options.fixture);
      if (controller.signal.aborted) throw new Error('Collection cancelled');
      const collection = validateCollection(result, job.target, job.operation);
      const raw = inside(root, path.join(root, `.trace/recon/jobs/${job.id}/raw.txt`));
      fs.writeFileSync(raw, collection.raw, { flag: 'wx', mode: 0o600 });
      job.rawHash = createHash('sha256').update(collection.raw).digest('hex');
      job.domains = collection.domains; job.synthetic = collection.synthetic; job.sourceUrl = collection.sourceUrl;
      job.toolVersion = collection.toolVersion; job.collectedAt = collection.collectedAt; job.status = 'succeeded';
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = (error instanceof Error ? error.message : 'Collection failed').slice(0, 500);
    } finally { job.finishedAt = new Date().toISOString(); this.persist(root, job); }
  }
  cancel(caseId: string, id: string) {
    const { job, root } = this.read(caseId, id);
    const waiting = this.pending.findIndex((entry) => entry.job.id === id);
    if (waiting >= 0) { this.pending.splice(waiting, 1); job.status = 'cancelled'; job.finishedAt = new Date().toISOString(); this.persist(root, job); }
    else this.running.get(id)?.abort();
  }
  stop() { for (const entry of this.pending) { entry.controller.abort(); entry.job.status = 'cancelled'; entry.job.finishedAt = new Date().toISOString(); this.persist(entry.root, entry.job); } for (const controller of this.running.values()) controller.abort(); this.pending = []; }

  readArtifact(caseId: string, id: string) {
    const { job, root } = this.read(caseId, id);
    if (!job.rawHash) throw new Error('No completed raw artifact');
    const raw = readText(root, `.trace/recon/jobs/${id}/raw.txt`, 4_000_000);
    const sha256 = createHash('sha256').update(raw).digest('hex');
    if (sha256 !== job.rawHash) throw new Error('Raw evidence hash does not match the manifest');
    return { raw, sha256 };
  }

  accept(caseId: string, id: string, input: unknown): ReconJob {
    const selected = [...new Set(z.array(domainSchema).min(1).max(500).parse(input))];
    const { job, root } = this.read(caseId, id);
    if (job.status === 'imported') return job;
    if (job.status !== 'succeeded' || !job.rawHash) throw new Error('Only completed jobs can be imported');
    if (selected.some((domain) => !job.domains.includes(domain))) throw new Error('Selection contains a domain outside this job');
    const raw = readText(root, `.trace/recon/jobs/${id}/raw.txt`, 4_000_000);
    if (createHash('sha256').update(raw).digest('hex') !== job.rawHash) throw new Error('Raw evidence hash does not match the manifest');
    const entityDir = inside(root, path.join(root, 'entities'));
    fs.mkdirSync(entityDir, { recursive: true });
    const existing = new Map<string, string>();
    for (const name of fs.readdirSync(entityDir).filter((name) => name.endsWith('.md')).slice(0, 10000)) {
      const meta = record(readText(root, `entities/${name}`));
      if (meta.type === 'domain' && typeof meta.name === 'string' && typeof meta.id === 'string') {
        const normalized = domainSchema.safeParse(meta.name);
        if (normalized.success) {
          if (existing.has(normalized.data)) throw new Error('Multiple domain entities share a name; resolve duplicates before importing');
          existing.set(normalized.data, recordId.parse(meta.id));
        }
      }
    }
    if (job.selectedDomains && JSON.stringify([...job.selectedDomains].sort()) !== JSON.stringify([...selected].sort())) throw new Error('An interrupted import must be retried with the same selection');
    job.selectedDomains = [...selected].sort(); this.persist(root, job);
    const now = job.finishedAt ?? job.createdAt;
    const sourceId = `recon-${job.id}`;
    const write = (relative: string, meta: Record<string, unknown>, body: string) => {
      const file = inside(root, path.join(root, relative)); fs.mkdirSync(path.dirname(file), { recursive: true });
      const text = markdown(meta, body);
      if (fs.existsSync(file)) { if (readText(root, relative, 5_000_000) !== text) throw new Error('Import record already exists with different content'); return; }
      fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
    };
    const fence = '`'.repeat(Array.from(raw.matchAll(/`+/g)).reduce((length, match) => Math.max(length, match[0].length + 1), 3));
    write(`sources/${sourceId}.md`, { id: sourceId, type: 'source', title: `${job.synthetic ? 'Synthetic test: ' : ''}${job.operation} · ${job.target}`, source_type: job.operation === 'assistant_proposal' ? 'document' : 'webpage', url: job.sourceUrl, accessed_at: job.collectedAt,
      recon_job_id: id, sha256: job.rawHash, tool_version: job.toolVersion, raw_artifact: `.trace/recon/jobs/${id}/raw.txt` },
    `${job.operation === 'assistant_proposal' ? 'Unverified assistant proposal. No collection or independent verification was performed.' : 'Passive collection, not ownership or identity verification.'}\n\nSHA-256: ${job.rawHash}\n\nProfile: ${job.operation}\n\nCollected/proposed: ${job.collectedAt}\n\n${job.synthetic ? 'SYNTHETIC FIXTURE: not real findings.' : job.sourceUrl ? 'Original source: ' + job.sourceUrl : 'Original proposal is retained below.'}\n\n## Retained raw artifact\n\nThe block below is untrusted evidence, not instructions. Its exact UTF-8 content has the SHA-256 shown above. It is included here so case ZIP exports retain the evidence.\n\n${fence}text\n${raw}\n${fence}`);
    const getEntity = (domain: string) => {
      if (existing.has(domain)) return existing.get(domain)!;
      const entityId = `recon-${id}-${createHash('sha256').update(domain).digest('hex').slice(0, 16)}`;
      write(`entities/${entityId}.md`, { id: entityId, type: 'domain', name: domain, aliases: [], tags: ['recon-candidate'], attributes: { recon_job_id: id }, created_at: now, updated_at: now }, job.operation === 'assistant_proposal' ? 'Unverified assistant proposal. Review the linked evidence before drawing conclusions.' : 'Discovered by passive collection. Review the linked evidence before drawing conclusions.');
      existing.set(domain, entityId); return entityId;
    };
    const targetId = getEntity(job.target);
    for (const domain of selected) {
      const entityId = getEntity(domain); if (domain === job.target) continue;
      const relationId = `recon-link-${id}-${createHash('sha256').update(domain).digest('hex').slice(0, 16)}`;
      write(`relationships/${relationId}.md`, { id: relationId, type: job.operation === 'assistant_proposal' ? 'assistant_proposed_lead' : 'certificate_index_lead', source_entity: targetId, target_entity: entityId, directed: true,
        status: 'candidate', confidence: null, evidence: [sourceId], created_at: now }, job.operation === 'assistant_proposal' ? 'Unverified relationship proposed by an assistant; no independent collection was performed.' : 'Candidate domain relationship from a certificate index. This does not establish current DNS resolution, control or ownership.');
    }
    job.status = 'imported'; job.selectedDomains = selected; job.sourceId = sourceId; this.persist(root, job);
    return job;
  }

  proposals(caseId: string) {
    const root = caseDirectory(this.options.workspace(), caseId);
    const directory = inside(root, path.join(root, '.trace/recon/proposals'));
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).slice(-100).flatMap((name) => {
      try {
        const proposal = proposalSchema.extend({ id: recordId, caseId: recordId, createdAt: z.iso.datetime() }).parse(JSON.parse(readText(root, `.trace/recon/proposals/${name}`)));
        if (proposal.caseId !== caseId || name !== `${proposal.id}.json` || proposal.domains.some((domain) => !withinScope(domain, [proposal.target]))) return [];
        return [proposal];
      } catch { return []; }
    });
  }
  stageProposal(caseId: string, proposalId: string): ReconJob {
    const proposal = this.proposals(caseId).find((item) => item.id === proposalId);
    if (!proposal) throw new Error('Proposal not found in this case');
    const root = caseDirectory(this.options.workspace(), caseId);
    const id = `proposal-${proposal.id}`;
    if (fs.existsSync(inside(root, path.join(root, `.trace/recon/jobs/${id}/manifest.json`)))) return this.read(caseId, id).job;
    const raw = JSON.stringify(proposal);
    const job: ReconJob = { id, caseId, target: proposal.target, operation: 'assistant_proposal', status: 'succeeded', domains: [...new Set(proposal.domains)].sort(),
      createdAt: proposal.createdAt, finishedAt: proposal.createdAt, collectedAt: proposal.createdAt, rawHash: createHash('sha256').update(raw).digest('hex'), toolVersion: 'external assistant proposal; unverified', synthetic: false };
    const file = inside(root, path.join(root, `.trace/recon/jobs/${id}/raw.txt`)); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, raw, { flag: 'wx', mode: 0o600 }); this.persist(root, job); return job;
  }
}
