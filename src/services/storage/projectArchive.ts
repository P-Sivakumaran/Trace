import JSZip from 'jszip';
import { z } from 'zod';
import {
  EntityFrontmatterSchema, NoteFrontmatterSchema, ProjectFrontmatterSchema,
  RelationshipFrontmatterSchema, SourceFrontmatterSchema,
  type GraphLayout, type ProjectData,
} from '@/types';
import {
  parseEntityFile, parseMarkdownFrontmatter, parseNoteFile, parseProjectFile,
  parseRelationshipFile, parseSourceFile,
} from '../markdownParser';

const identifier = z.string().regex(/^[a-zA-Z0-9_.-]+$/).refine((id) => id !== '.' && id !== '..');
const layoutSchema = z.object({ positions: z.record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() })) });

/** Parse the entire archive before either adapter starts writing a case. */
export async function readProjectArchive(file: File | ArrayBuffer): Promise<{ data: ProjectData; layout: GraphLayout }> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > 10_000) throw new Error('Project archive contains too many files');
  const roots = entries.filter((entry) => entry.name.split('/').at(-1) === 'project.md');
  if (roots.length !== 1) throw new Error('Project archive must contain exactly one project.md');
  const root = roots[0];
  const prefix = root.name.slice(0, -'project.md'.length);
  let totalCharacters = 0;
  async function read(entry: JSZip.JSZipObject): Promise<string> {
    let text = '';
    return new Promise((resolve, reject) => {
      // JSZip exposes this streaming API at runtime but omits it from JSZipObject's types.
      const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'string'): JSZip.JSZipStreamHelper<string> }).internalStream('string');
      stream.on('data', (chunk) => {
        totalCharacters += chunk.length;
        if (text.length + chunk.length > 5_000_000 || totalCharacters > 50_000_000) {
          stream.pause();
          reject(new Error('Project archive exceeds the text import limit'));
          return;
        }
        text += chunk;
      }).on('error', reject).on('end', () => resolve(text)).resume();
    });
  }
  const projectText = await read(root);
  ProjectFrontmatterSchema.parse(parseMarkdownFrontmatter(projectText).frontmatter);
  const project = parseProjectFile(projectText, 'imported');
  identifier.parse(project.id);

  async function records<T extends { id: string }>(directory: string, schema: z.ZodType, parse: (raw: string, fallback: string) => T): Promise<T[]> {
    const start = `${prefix}${directory}/`;
    const files = entries.filter((entry) => entry.name.startsWith(start) && !entry.name.slice(start.length).includes('/') && entry.name.endsWith('.md'));
    const result: T[] = [];
    const ids = new Set<string>();
    for (const entry of files) {
      const raw = await read(entry);
      schema.parse(parseMarkdownFrontmatter(raw).frontmatter);
      const record = parse(raw, entry.name.slice(start.length, -3));
      identifier.parse(record.id);
      if (ids.has(record.id)) throw new Error(`Duplicate ${directory} identifier: ${record.id}`);
      ids.add(record.id);
      result.push(record);
    }
    return result;
  }
  const entities = await records('entities', EntityFrontmatterSchema, parseEntityFile);
  const relationships = await records('relationships', RelationshipFrontmatterSchema, parseRelationshipFile);
  const sources = await records('sources', SourceFrontmatterSchema, parseSourceFile);
  const notes = await records('notes', NoteFrontmatterSchema, parseNoteFile);
  const layoutFile = zip.file(`${prefix}graph-layout.json`);
  const layout = layoutFile ? layoutSchema.parse(JSON.parse(await read(layoutFile))) : { positions: {} };
  return { data: { project, entities, relationships, sources, notes }, layout };
}

/** Keep internal entity/evidence IDs stable; only the enclosing case ID must change. */
export function availableImportId(preferred: string, occupied: Iterable<string>): string {
  const ids = new Set(occupied);
  if (!ids.has(preferred)) return preferred;
  let id: string;
  do { id = `imported-${crypto.randomUUID()}`; } while (ids.has(id));
  return id;
}
