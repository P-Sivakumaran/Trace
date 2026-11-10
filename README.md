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
- **Entity icons**: each node shows its entity type's icon once it is large enough on screen to read (person, company, domain, IP, email, and device types: computer, laptop, smartphone, server, network interface).
- **Verification is visible**: confirmed and supported links are solid; unverified, candidate and rejected links are dashed or dotted and fainter.
- **Evidence on the graph**: highlighted links carry a midpoint dot, filled when the link cites at least one source and hollow when it is unsourced. Hovering a link shows its evidence class and sources with capture dates and URLs.
- **Working tools**: multi-select, shortest path between two nodes, collapse leaf entities into collections, size nodes by connections, filter by entity type and verification status, find-in-graph.
- **Connect mode**: hold <kbd>C</kbd> (or <kbd>⌥</kbd>) and drag from one node to another to create a relationship.
- **Notes on the graph**: `[[Entity name]]` mentions in notes appear as dotted links.
- **Entity palette**: drag an entity type onto the canvas to create it in place.

### Transforms
Run lookups against an entity from the inspector or its context menu and get new entities and relationships back. Built-in machines cover domain footprinting, IP threat and infrastructure, and identity deep-dive. Output goes to the console under the graph.

### Relationship discovery
**Discover** scans a case for non-obvious links: shared surnames, phones and emails, corporate email domains, IPs and hosts, employers and locations, tax IDs, passports, Telegram handles, vehicle plates, and names mentioned in other entities' attributes. Suggestions are added as `unverified` candidates for you to review and confirm, one by one or in bulk.

### Evidence and sources
- Sources (webpages, documents, registries, leaks, interviews…) are cited by relationships as evidence. A relationship can cite any number of sources, each with a URL and capture date, plus the investigator's explanation.
- Every relationship has an **evidence class** derived from its verification status: *Observed fact* (confirmed, supported), *Hypothesis* (unverified, candidate) or *Disproven* (rejected).
- **Bookmarks** tab: bookmark OSINT sites and JSON APIs, with a preset pack (VirusTotal, Shodan, Censys, WHOIS, Wayback and others).
- **API console**: send GET/POST/PUT/PATCH/DELETE requests with custom headers and body. In the desktop app requests run in the main process, so CORS does not apply. Attach a response to an entity as a source, a note, or an attribute.

### Tools marketplace
The **Tools** button in the left rail opens a small marketplace of well-known OSINT tools that TRACE can install and run for you: **Sherlock** and **Maigret** (username search across hundreds of sites), **Holehe** and **Ignorant** (which services an email or phone number is registered on), **DNSRecon** (DNS records, name servers, mail hosts) and **dnstwist** (look-alike domains). Each tool is installed from PyPI into its own isolated Python environment inside TRACE's data folder (TRACE uses the system Python 3.9+, or downloads a checksum-verified portable Python if there is none) and can be removed again with one click. Pick an entity from the case, press **Run**, watch the live output, then **Review & add to case**: results go through the same review as file imports, linked to the entity you ran the tool on. See [docs/TOOLS.md](docs/TOOLS.md).

### Importing data from other tools
TRACE organises what collection tools find; it does not replace them. **Import data** (Case brief toolbar or the explorer rail) reads SpiderFoot CSV exports, CSV files with type/value columns, plain indicator lists and the canonical TRACE import JSON. Before anything is written you review every entity: possible duplicates of existing entities are flagged and linked to the existing record instead of overwriting it. Imported records are tagged `imported`, keep the tool's original record and timestamps in their frontmatter, and cite an import source that also stores anything that could not be mapped. Imported relationships start as *Candidate*. See [docs/IMPORT.md](docs/IMPORT.md).

### AI agents (MCP, read-only)
A local [Model Context Protocol](https://modelcontextprotocol.io) server ships inside the app and lets AI agents explore your investigations as graphs: list cases, search entities, read entity and relationship details, walk neighbourhoods, follow evidence and find paths between entities. It is **read-only**: it cannot create, edit or delete anything. Turn it on or off in **Tools → MCP server** (off by default); the panel shows the ready-to-paste client configuration. See [docs/MCP.md](docs/MCP.md).

### Workspace
- **Explorer**: entities grouped by type and sortable by connections, plus links, sources, notes and tools, all filterable.
- **Inspector**: properties, relationships, evidence, notes and transforms for the selected entity or relationship; case composition when nothing is selected. It reopens by itself when you pick an object, and its Evidence and Notes sections have **+** buttons to cite a new or existing source on a relationship and to start a note about the entity.
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
~/Documents/trace/removed/ # cases removed from TRACE but kept on disk (never read by TRACE or MCP)
```

The folder can be changed in Settings, which also shows how much space TRACE's data takes (investigations, installed tools, portable Python) and lets you remove investigations: on desktop you choose **Remove from TRACE** (files are kept in the workspace's `removed/` folder and can be re-imported) or **Remove from disk** (folder moved to the system Trash). Cases can be exported to a `.zip` and imported from a `.zip`, from a case folder, or by picking its `project.md`: **Import investigation…** in the investigation menu (on macOS one dialog accepts all three; on Windows, Linux and in the browser there are separate "(.zip)" and "folder" entries). `project.md` is the entry point, so a folder is recognised by having one. Imports always create a new case: if a case with the same id exists, the import is saved as "<name> (imported)" and nothing is overwritten; unrelated files in the folder are ignored. The web build stores data in the browser instead.

---

## Download

Get the latest build from [**GitHub Releases**](https://github.com/dlxarl/Trace/releases): macOS (Apple Silicon and Intel), Windows x64 and Linux x64. The current version is `0.2.0-alpha.1`.

**Settings → About & Updates → Check for Updates** compares your version with the newest release on GitHub (alpha pre-releases included) and shows its release notes with a link to the release page. Nothing is downloaded or installed automatically. **Settings → Changelog** shows the release notes of the installed version from its GitHub release (cached, so it also works offline), and after the app is updated to a newer version a **What's new** dialog shows those notes once. Builds without a published release (local or unreleased) simply show no changelog.

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
| `npm run build:mcp` | Build the read-only MCP server to `dist-mcp/trace-mcp.mjs` (also part of `build:electron`, bundled into packaged apps) |
| `npm run mcp` | Build and run the MCP server on stdio |

## Packaging

Output goes to `release/`.

| Command | Produces |
| :--- | :--- |
| `npm run package:mac` | `.dmg` and `.zip` for arm64 and x64 |
| `npm run package:win` | NSIS installer and `.zip` (x64) |
| `npm run package:linux` | `.AppImage` and `.tar.gz` (x64) |
| `npm run package:all` | All of the above |
| `npm run package:dir` | Unpacked macOS `.app` for quick testing |

Intel artifacts are named `…-x86_64.*` (`build/renameArtifacts.cjs` renames electron-builder's `x64` after packaging), e.g. `Trace-0.2.0-alpha.1-mac-x86_64.dmg`. The MCP server is bundled automatically (`build:electron` also builds `dist-mcp/trace-mcp.mjs`).

Every build gets a **Build ID** in the form `YYYYMMDDHHMMSS-<12-char git commit>` (UTC time of the build and the commit it was built from; `unknown` when git is unavailable). It is generated at compile time by `build/buildId.ts`, embedded as `__BUILD_ID__`, and shown in the desktop app on the loading screen and in Settings. It identifies a build; it is not a checksum of the binary. The web build does not display it.

The version has a single source: `version` in `package.json`. The renderer reads it at build time (`__APP_VERSION__`), Electron reports it through `app.getVersion()`, electron-builder uses it for artifact names and bundle metadata, and the MCP server and update checker use the same value.

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
electron/                  Main and preload processes (filesystem, HTTP, window, tool runner, portable Python, disk usage, case import)
src/
├── components/
│   ├── common/            Dialog, custom Select menu, code block, release notes, status badge, entity icons, Markdown editor
│   ├── layout/            Tab bar, explorer, inspector, status bar
│   └── modals/            Settings, import review, shortcuts, command palette, entity/relationship dialogs
├── features/
│   ├── graph/             Graph view, force layout, theme, palette, transform console
│   ├── tools/             Tools view: marketplace, tool runner, MCP switch
│   ├── entities/ relationships/ sources/ notes/   Editors
│   ├── projects/          Case brief
│   └── search/            Full-text search
├── core/                  Read-only investigation queries and sandboxed workspace reader
├── mcp/                   Read-only MCP server (stdio JSON-RPC) and tool definitions
├── services/
│   ├── storage/           Electron (disk) and browser adapters
│   ├── import/            Import adapters, duplicate detection and review plan
│   ├── updates/           SemVer comparison and GitHub Releases update checker
│   ├── tools/             Tool catalog (Sherlock, Maigret, Holehe) and output parsers
│   ├── transforms/        Transform registry and HTTP client
│   ├── discovery/         Relationship discovery heuristics
│   ├── markdownParser.ts  Frontmatter parser and serializer
│   └── sqliteIndex.ts     SQLite FTS5 indexer
├── tests/                 Vitest suites
└── types/                 Domain types and schemas
build/                     App icons, packaging hooks, Build ID generator
```

---

## Security and privacy

- Data stays on your filesystem as readable Markdown.
- No telemetry, analytics or cloud services. The app only makes network requests you trigger (transforms, the API console, installing and running tools, and Check for Updates, which calls the public GitHub Releases API).
- Tools run only when you press Run, from catalog-defined commands (no shell, input validated, isolated Python environments, hard timeout). They contact third-party websites from your computer.
- The MCP server is off until you enable it. It reads only `projects/` inside your TRACE workspace, validates every id, refuses symlinks that point outside it and has no write operations.
- Works fully offline for everything else.

## License

[MIT](LICENSE)
