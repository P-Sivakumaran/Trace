# TRACE MCP server (read-only)

TRACE ships a local [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents explore your investigations. It runs on your machine over stdio and needs no cloud services.

**It is read-only.** It has no tool that creates, edits or deletes entities, relationships, evidence or verification statuses, and the code that serves it has no write path to your files.

## Turning it on

Open **Tools** (left rail) → **MCP server** and flip the switch. It is **off by default**. The panel shows the exact client configuration with copy buttons; the server is bundled inside the app and runs with TRACE's own binary, so Node.js is not required:

```json
{
  "mcpServers": {
    "trace": {
      "command": "/Applications/Trace.app/Contents/MacOS/Trace",
      "args": ["/Applications/Trace.app/Contents/Resources/mcp/trace-mcp.mjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

The switch is stored as `mcpEnabled` in the app's `trace-config.json` and re-read on **every request**, so turning it off takes effect immediately: `tools/list` returns no tools and every call returns an error. No client restart is needed.

Access rule: if the desktop app has been run on the machine, its switch decides (off unless enabled). Only a source checkout on a machine without the app runs without the switch.

## Running from source

```bash
npm install
npm run build:mcp          # → dist-mcp/trace-mcp.mjs (single file, no node_modules needed)
node dist-mcp/trace-mcp.mjs --workspace ~/Documents/trace
```

Workspace resolution, first match wins:

1. `--workspace <path>`
2. `TRACE_WORKSPACE` environment variable
3. the folder chosen in the TRACE desktop app (read from its `trace-config.json`)
4. `~/Documents/trace`

Only `<workspace>/projects/` is ever read.

Client configuration for a source checkout:

```bash
claude mcp add trace -- node /absolute/path/to/Trace/dist-mcp/trace-mcp.mjs --workspace ~/Documents/trace
```

## Tools

Every tool is annotated `readOnlyHint: true`, `destructiveHint: false`. Results are JSON (`structuredContent` plus the same JSON as text).

| Tool | Purpose |
| :--- | :--- |
| `list_projects` | Investigations with entity / relationship / source / note counts |
| `get_project_summary` | Counts, entity types, verification statuses, evidence classes, unsourced links, connected components, most connected entities, the case brief (truncated) |
| `search_entities` | Ranked search over names, aliases, tags, attribute values and notes; optional `entity_type` filter |
| `get_entity` | Attributes, aliases, tags, notes, provenance (`manual` or `import` with tool, file, timestamps) and relationship-type breakdown |
| `get_entity_neighbors` | Subgraph around an entity up to depth 3: neighbours with distance + the relationships between them |
| `get_relationship` | Endpoints, type, direction, status, evidence class, confidence, explanation, provenance and evidence sources |
| `get_evidence` | One of: sources behind a relationship, all sources behind an entity's links (plus its unsourced links), or a source's content and the links it supports |
| `find_paths` | All shortest paths between two entities (links treated as undirected), each with its weakest evidence class |

Evidence classes: `observed` (confirmed / supported), `hypothesis` (unverified / candidate), `disproven` (rejected). Rejected links are excluded from neighbourhoods and paths unless `include_rejected: true`.

Bounded outputs: search ≤ 100 results, neighbours ≤ 200 entities and depth ≤ 3, paths ≤ 20 and depth ≤ 6, long Markdown bodies are truncated to 4,000 characters with a `*_truncated` flag.

## Security model

- Project and record ids must match `^[a-zA-Z0-9_\-.]{1,128}$`; `.` and `..` are rejected.
- Project directories are resolved with `realpath` and must stay inside `<workspace>/projects`; symlinked projects pointing elsewhere are ignored, and symlinked or oversized (> 2 MB) Markdown files are skipped.
- Only `*.md` files in `entities/`, `relationships/`, `sources/`, `notes/` and `project.md` are read. No other files, environment variables or settings are exposed.
- Unknown arguments, wrong types and unknown tools are rejected with an error result. Internal errors never return stack traces or paths.
- Only `initialize`, `ping`, `tools/list` and `tools/call` are implemented; resources, prompts and sampling are not offered.

## Architecture

```
MCP client ──stdio JSON-RPC──▶ src/mcp/server.ts      protocol only
                               src/mcp/tools.ts       schemas, argument validation, dispatch
                               src/core/investigation.ts   pure read-only graph queries (InvestigationIndex)
                               src/core/fsWorkspace.ts     sandboxed workspace reader (reuses markdownParser)
```

The handlers never touch the filesystem directly: they get a `ProjectSource` (list / load only) and query `InvestigationIndex`. The same core can be reused by a future CLI or local HTTP API.

## Limitations

- Projects are re-read from disk on every call (always fresh, but slower on very large cases).
- Only the desktop app's on-disk workspace is supported; the browser build's data lives in browser storage and is not reachable.
