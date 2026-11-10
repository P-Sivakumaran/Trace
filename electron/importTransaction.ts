import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readProjectArchive, availableImportId } from '../src/services/storage/projectArchive.js';
import {
  serializeEntityFile,
  serializeNoteFile,
  serializeProjectFile,
  serializeRelationshipFile,
  serializeSourceFile,
} from '../src/services/markdownParser.js';

const STAGING_DIRNAME = '.trace-import-staging';

/**
 * Builds the imported case entirely in a staging directory outside `projects/`,
 * then moves it into place with one rename. A disk-full write, a quota error or
 * the process dying mid-import can only ever leave an orphaned staging directory
 * behind; `projects/` either gains the complete case or nothing at all.
 */
export async function transactionalImport(
  workspacePath: string,
  buffer: ArrayBuffer,
  existingProjectIds: string[]
): Promise<string> {
  const { data, layout } = await readProjectArchive(buffer);
  data.project.id = availableImportId(data.project.id, existingProjectIds);
  const id = data.project.id;

  const projectsDir = path.resolve(workspacePath, 'projects');
  const stagingRoot = path.join(workspacePath, STAGING_DIRNAME);
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.mkdirSync(stagingRoot, { recursive: true });
  const stagingDir = path.join(stagingRoot, randomUUID());

  try {
    fs.mkdirSync(stagingDir);
    for (const sub of ['entities', 'relationships', 'sources', 'notes']) {
      fs.mkdirSync(path.join(stagingDir, sub));
    }
    for (const entity of data.entities) {
      fs.writeFileSync(path.join(stagingDir, 'entities', `${entity.id}.md`), serializeEntityFile(entity));
    }
    for (const relationship of data.relationships) {
      fs.writeFileSync(
        path.join(stagingDir, 'relationships', `${relationship.id}.md`),
        serializeRelationshipFile(relationship)
      );
    }
    for (const source of data.sources) {
      fs.writeFileSync(path.join(stagingDir, 'sources', `${source.id}.md`), serializeSourceFile(source));
    }
    for (const note of data.notes) {
      fs.writeFileSync(path.join(stagingDir, 'notes', `${note.id}.md`), serializeNoteFile(note));
    }
    fs.writeFileSync(path.join(stagingDir, 'graph-layout.json'), JSON.stringify(layout, null, 2));
    // Written last: project.md's presence is what projects:list treats as "this is a case".
    fs.writeFileSync(path.join(stagingDir, 'project.md'), serializeProjectFile(data.project));

    const projectDir = path.join(projectsDir, id);
    if (fs.existsSync(projectDir)) throw new Error(`A case with id "${id}" already exists`);
    fs.renameSync(stagingDir, projectDir);
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
  return id;
}

/** Discards staging left behind by an import that never finished its rename (crash, force-quit). */
export function cleanupOrphanedImports(workspacePath: string): void {
  fs.rmSync(path.join(workspacePath, STAGING_DIRNAME), { recursive: true, force: true });
}
