# Trace — Local-First OSINT Investigation & Link Analysis

<p align="center">
  <img src="./build/icon.png" alt="Trace Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>Trace</strong> is a desktop workbench for OSINT analysts, researchers and investigators. Map entities and relationships on a force-directed graph, attach evidence, and keep everything as plain Markdown files on your own machine.
</p>

---
<p align="center">
  <img width="332" height="72" alt="trace-4x" src="https://github.com/user-attachments/assets/193f32d2-6dd4-4ab8-a61f-7d963827a479" />
</p>
<img width="1280" height="820" alt="Screenshot 2026-11-07 at 19 38 31" src="https://github.com/user-attachments/assets/5cd6b9de-4f24-4161-be9d-9f3d95153b00" />

## Features

### Graph
- **Force-directed layout** (ForceAtlas2-style with Barnes–Hut): strongly connected entities form clusters around hubs, loose components stay near the main network, nodes never overlap. Handles thousands of nodes. Hierarchical, radial and grid layouts are also available.
- **Stable layouts**: adding entities only places the new nodes next to their neighbours; existing positions are kept. Node positions can be saved per case.
- **Readable at any scale**: small muted nodes coloured by entity type, thin low-contrast edges, labels revealed by importance as you zoom in, and a dimmed background when something is selected.
- **Verification is visible**: confirmed and supported links are solid; unverified, candidate and rejected links are dashed or dotted and fainter.
- **Working tools**: multi-select, shortest path between two nodes, collapse leaf entities into collections, size nodes by connections, filter by entity type and verification status, find-in-graph.
- **Connect mode**: hold <kbd>C</kbd> (or <kbd>⌥</kbd>) and drag from one node to another to create a relationship.
- **Notes on the graph**: `[[Entity name]]` mentions in notes appear as dotted links.
- **Entity palette**: drag an entity type onto the canvas to create it in place.

### Transforms
Run lookups against an entity from the inspector or its context menu and get new entities and relationships back. Built-in machines cover domain footprinting, IP threat and infrastructure, and identity deep-dive. Output goes to the console under the graph.

### Relationship discovery
**Discover** scans a case for non-obvious links: shared surnames, phones and emails, corporate email domains, IPs and hosts, employers and locations, tax IDs, passports, Telegram handles, vehicle plates, and names mentioned in other entities' attributes. Suggestions are added as `unverified` candidates for you to review and confirm, one by one or in bulk.

### Evidence and sources
- Sources (webpages, documents, registries, leaks, interviews…) are cited by relationships as evidence.
- **Tools** tab: bookmark OSINT sites and JSON APIs, with a preset pack (VirusTotal, Shodan, Censys, WHOIS, Wayback and others).
- **API console**: send GET/POST/PUT/PATCH/DELETE requests with custom headers and body. In the desktop app requests run in the main process, so CORS does not apply. Attach a response to an entity as a source, a note, or an attribute.

### Workspace
- **Explorer**: entities grouped by type and sortable by connections, plus links, sources, notes and tools, all filterable.
- **Inspector**: properties, relationships, evidence, notes and transforms for the selected entity or relationship; case composition when nothing is selected.
- **Case brief**: the `project.md` working document with case statistics and the most connected entities.
- **Full-text search**: local SQLite FTS5 (WebAssembly) over names, aliases, attributes, tags, relationships and Markdown bodies.
- **Tabs and panels**: preview and pinned tabs, resizable panels, command palette, status bar.

### Local-first
No accounts, no cloud sync, no telemetry. Each case is a folder of Markdown files that diff well and work with `git`:

```
~/Documents/trace/projects/<project-id>/
├── project.md            # scope, status, briefing
├── entities/*.md         # one file per entity (YAML frontmatter + notes)
├── relationships/*.md    # direction, status, confidence, evidence
├── sources/*.md          # evidence and provenance
├── notes/*.md            # analyst notes (GitHub Flavored Markdown)
└── graph-layout.json     # saved node positions
```

The folder can be changed in Settings. Cases can be exported to and imported from a `.zip`. The web build stores data in the browser instead.

---

## Download

Get the latest build from the [**v0.1.0-alpha.2 release**](https://github.com/dlxarl/Trace/releases/tag/v0.1.0-alpha.2): macOS (Apple Silicon and Intel), Windows x64 and Linux x64.

Builds are not code-signed (macOS uses an ad-hoc signature), so your OS will warn on first launch. On macOS, right-click the app and choose Open.

## Development

**Requirements:** Node.js 18+ (20+ recommended) and npm.

```bash
git clone https://github.com/dlxarl/Trace.git
cd Trace
npm install
```

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Run in the browser |
| `npm run dev:electron` | Run as an Electron app |
| `npm test` | Run the tests (Vitest) |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build the web bundle |

## Packaging

### Reproducible checks and case imports

Use Node.js 22.12 or newer and `npm ci` for the locked dependency set. `npm test`
runs the installed Vitest version; it does not download a runner at execution time.
CI runs tests, lint and the web build. Desktop packaging still needs Electron's
platform runtime and the appropriate operating system/toolchain.

Importing an archive with an existing case ID creates a separate case instead of
overwriting the original. Entity/evidence IDs and graph positions are preserved
inside the imported case, and search is scoped by case and record type. Archives
must have one `project.md`, valid frontmatter and valid record IDs/positions.
Text imports are limited to 5 million characters per file, 50 million in total
and 10,000 files. Keep exported archives as backups of browser-local cases.

For an isolated or portable desktop workspace, set absolute paths before starting:

```sh
npm run build:electron
TRACE_WORKSPACE_PATH=/absolute/path/to/cases \
TRACE_USER_DATA_DIR=/absolute/path/to/profile \
./node_modules/.bin/electron .
```

The workspace override takes precedence over saved workspace settings and skips
automatic migration of the legacy Documents workspace. The profile override
keeps settings separate. Omit both variables to use the existing default behavior.

See [the reliability review](docs/local-reliability-review.md) for verified scope
and remaining work.

Output goes to `release/`.

| Command | Produces |
| :--- | :--- |
| `npm run package:mac` | `.dmg` and `.zip` for arm64 and x64 |
| `npm run package:win` | NSIS installer and `.zip` (x64) |
| `npm run package:linux` | `.AppImage` and `.tar.gz` (x64) |
| `npm run package:all` | All of the above |
| `npm run package:dir` | Unpacked macOS `.app` for quick testing |

Each Electron build gets a fresh SHA-256 build identifier, shown in Settings and on the loading screen. The web build has none.

---

## Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd> | Command palette |
| <kbd>Cmd/Ctrl</kbd> + <kbd>G</kbd> | Graph |
| <kbd>Cmd/Ctrl</kbd> + <kbd>O</kbd> | Case brief |
| <kbd>Cmd/Ctrl</kbd> + <kbd>F</kbd> | Full-text search |
| <kbd>Cmd/Ctrl</kbd> + <kbd>[</kbd> / <kbd>]</kbd> | Toggle explorer / inspector |
| <kbd>Cmd/Ctrl</kbd> + <kbd>,</kbd> | Settings |
| <kbd>/</kbd> | Focus find-in-graph |
| <kbd>F</kbd> / <kbd>L</kbd> / <kbd>N</kbd> | Fit view / re-run layout / new entity (graph focused) |
| <kbd>C</kbd> | Connect mode |
| <kbd>?</kbd> | Shortcut sheet |
| <kbd>Esc</kbd> | Close dialog, menu or clear search |

---

## Project structure

```
electron/                  Main and preload processes (filesystem, HTTP, window)
src/
├── components/
│   ├── common/            Dialog, status badge, entity icons, Markdown editor
│   ├── layout/            Tab bar, explorer, inspector, status bar
│   └── modals/            Settings, shortcuts, command palette, entity/relationship dialogs
├── features/
│   ├── graph/             Graph view, force layout, theme, palette, transform console
│   ├── entities/ relationships/ sources/ notes/   Editors
│   ├── projects/          Case brief
│   └── search/            Full-text search
├── services/
│   ├── storage/           Electron (disk) and browser adapters
│   ├── transforms/        Transform registry and HTTP client
│   ├── discovery/         Relationship discovery heuristics
│   ├── markdownParser.ts  Frontmatter parser and serializer
│   └── sqliteIndex.ts     SQLite FTS5 indexer
├── tests/                 Vitest suites
└── types/                 Domain types and schemas
build/                     App icons and packaging hooks
```

---

## Security and privacy

- Data stays on your filesystem as readable Markdown.
- No telemetry or analytics. Network requests are triggered by you through transforms, the API console or passive recon; connected MCP clients receive the case data you expose to them.
- Works fully offline for everything else.

## License

[MIT](LICENSE)

## Passive recon and MCP

The desktop **Recon & MCP** panel connects to a local passive certificate-index
runner or a Kali runner over verified SSH. Review raw evidence and select domain
leads before importing sourced candidate relationships. A separate MCP server
lets an assistant read one selected case and submit unverified proposals for
operator review. It exposes no shell or collection tools to the assistant.

See [setup, evidence handling and MCP configuration](docs/kali-mcp-setup.md) and
[the development plan](docs/kali-mcp-development-plan.md). Build the runner with
`npm run build:mcp` before `npm run dev:electron`; `npm run build:electron`
includes that step. Kali deployment requires an actual SSH endpoint.

The [UX refinement plan](docs/ux-refinement-plan.md) records the applied anti-slop
review and verification. The desktop flow separates collection, connection and
assistant access; save and check the connection before collecting. A repeatable
`npm run check:ux` walkthrough covers review/import, failure recovery, keyboard,
contrast scans and reflow; its optional test-tool setup is in that plan.

## Case agent with account-based chat

Open a case and choose **Case agent** to chat through an installed Codex/ChatGPT
or Claude Code login. Choose the account for each message; models stay separate
by provider. Case sharing starts off. With sharing enabled, the agent can search
this case, read cited sources and stage unverified domain proposals for your
existing Recon review flow. It cannot run scans or write directly to the graph.

See [account setup and data sharing](docs/chat-agent-setup.md) and
[the development/verification record](docs/chat-agent-development-plan.md).
`npm run check:agent-ux` runs the optional native test harness with synthetic
providers by default. Real account smoke tests require explicit opt-in.

### Modern Web Guidance for contributors

Official web-platform and Chrome-extension skills, a pinned offline guidance CLI,
and isolated Chrome DevTools MCP are configured for Codex and Claude development.
See [installation, commands and maintenance](docs/modern-web-guidance.md).
Run `npm run check:web-guidance`; with Chrome installed, run `npm run check:chrome-mcp`.
Start a fresh coding session from this repository to discover the new skills.
