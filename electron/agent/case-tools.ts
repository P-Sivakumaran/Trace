import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, inside, readText } from '../recon/paths.js';
import { proposalSchema, recordId, withinScope } from '../../src/services/recon/contracts.js';

export function caseRecords(root: string) {
  const records: { category: string; id: string; text: string; truncated: boolean }[] = [];
  let truncated = false;
  for (const category of ['sources', 'entities', 'relationships', 'notes']) {
    let categoryBytes = 0;
    const directory = inside(root, path.join(root, category));
    if (!fs.existsSync(directory)) continue;
    const names = fs.readdirSync(directory).filter(name => name.endsWith('.md')).sort();
    if (names.length > 150) truncated = true;
    for (const name of names.slice(0, 150)) {
      if (categoryBytes >= 60000) { truncated = true; break; }
      const id = recordId.parse(name.slice(0, -3)); const file = inside(root, path.join(directory, name));
      const fd = fs.openSync(file, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(8000, 60000 - categoryBytes));
        const length = fs.readSync(fd, buffer, 0, buffer.length, 0); categoryBytes += length;
        records.push({ category, id, text: buffer.subarray(0, length).toString('utf8'), truncated: fs.fstatSync(fd).size > length });
      } finally { fs.closeSync(fd); }
    }
  }
  return { records, truncated: truncated || records.some(record => record.truncated) };
}
export function snapshot(root: string) {
  const rawBrief = readText(root, 'project.md', 500000);
  const brief = rawBrief.slice(0, 8000);
  const { records, truncated } = caseRecords(root);
  let text = `[case brief]\n${brief}`; let included = 0; const sourceIds: string[] = [];
  for (const record of records) {
    const entry = `\n\n[${record.category}:${record.id}]\n${record.text}`;
    if (text.length + entry.length > 48000) break;
    text += entry; included++;
    if (record.category === 'sources') sourceIds.push(record.id);
  }
  return { text, records: included + 1, truncated: rawBrief.length > 8000 || truncated || included < records.length, sourceIds };
}
export function searchCase(root: string, query: string) {
  const needle = query.toLowerCase();
  return caseRecords(root).records.flatMap(record => {
    const index = record.text.toLowerCase().indexOf(needle);
    return index < 0 ? [] : [{ category: record.category, id: record.id, excerpt: record.text.slice(Math.max(0, index - 120), index + 1000) }];
  }).slice(0, 12);
}
export function readSource(root: string, id: string) {
  return readText(root, `sources/${recordId.parse(id)}.md`, 5000000).slice(0, 16000);
}
export function propose(root: string, caseId: string, input: unknown, scope: string[]) {
  const proposal = proposalSchema.parse(input);
  if (!withinScope(proposal.target, scope) || proposal.domains.some(domain => !withinScope(domain, [proposal.target]))) throw new Error('Proposed domains are outside the saved scope');
  const id = randomUUID();
  atomicJson(root, `.trace/recon/proposals/${id}.json`, { id, caseId, createdAt: new Date().toISOString(), ...proposal });
  return id;
}
