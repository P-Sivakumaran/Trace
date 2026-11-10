# Trace local setup and reliability improvements

10 November 2026. Repository: P-Sivakumaran/Trace, cloned at 6e2c731 onto
`improve/local-reliability`. The fetched upstream main matched this base; no
upstream branch was merged. This is a local improvement pass, not a comprehensive
security or accessibility assessment.

## Implemented

- Locked Vitest and removed the test command's implicit runtime download.
- Shared archive reader validates the complete case before adapters begin writes.
  It requires one root, treats directory names literally (including regex
  punctuation), rejects invalid IDs/positions and duplicate record IDs, and
  bounds streamed text/file counts.
- An imported case with an occupied ID receives a separate ID. Browser collision
  checks include unreadable saved records. Internal records, evidence references
  and graph positions retain their IDs within the new case.
- Desktop imports persist active case selection after import. Duplicate case
  names no longer overwrite desktop directories; explicit existing IDs are
  rejected. Browser case creation also protects existing IDs.
- Case metadata uses YAML serialization so quoted/multiline input round-trips.
- SQLite keys and fallback search keys include case and record type. Deletion
  is scoped likewise. Legacy derived indexes are recreated and rebuilt from case
  files as they are opened; canonical Markdown is not deleted by this migration.
- Link validation parses real URLs and rejects malformed/control-character input.
- Absolute workspace/profile overrides allow an isolated desktop run without
  automatically relocating a legacy personal workspace.
- Added pinned-action CI for locked installation, tests, lint and web build.

## Verification

- 33 tests pass across eight suites, including SQLite and fallback case isolation,
  import preservation, validation before writes, archive paths with punctuation,
  graph positions, active selection and malformed URLs.
- Web and Electron builds pass. The existing large-bundle warning remains.
- Lint exits successfully with 175 pre-existing warnings and no errors; this pass
  does not claim to clean up the entire codebase. Remote CI has not been run.
- Native Electron walkthrough: independent duplicate case names, quoted metadata,
  two imports of the same ZIP, and persisted active selection after reload. No
  uncaught app errors were captured.
- Browser walkthrough: tutorial startup, duplicate ZIP imports and persisted
  selection after reload, with no uncaught app errors. A stale dev-server module
  cache after dependency installation was cleared by restarting Vite with `--force`.

These walkthroughs use synthetic local records. No third-party investigation,
paid transform or personal credential import was performed.

## Local use

The desktop app is running with workspace `../trace-workspace` and profile
`../trace-profile`, separate from the verification profile `../trace-evaluation`.
Browser mode runs at http://localhost:8090/. Its case data lives in that browser's
local storage; export ZIP backups. Browser and desktop storage are separate.

## Remaining review items

- Startup/storage failures are still caught broadly in existing code; visible
  recovery and corrupt-file handling deserve a dedicated pass.
- Prevalidation prevents parsing failures from partially overwriting a case, but
  a disk/quota failure or crash can still leave a partially created new import.
  Full transactional import/rollback is not implemented.
- Symlink handling, IPC sender/navigation policy, imported content and remote API
  request controls need a separate desktop security audit.
- Keyboard/dialog accessibility, responsive layouts, performance and the existing
  lint warnings remain follow-up work. No WCAG conformance is claimed.
- Source changes are local on the working branch; no push, PR or release was made.
