# Modern Web Guidance development integration

Installed 2026-11-11 for Trace. Official entry point: https://developer.chrome.com/docs/modern-web-guidance . This is a coding-agent knowledge package, not a browser extension, accessibility certification or runtime dependency.

## Installed components

- Canonical upstream skill packs in `.agents/skills/modern-web-guidance` (209 Markdown guides plus SKILL.md) and `.agents/skills/chrome-extensions` (SKILL.md plus 23 references). Claude aliases in `.claude/skills` resolve to those same files.
- Source: https://github.com/GoogleChrome/modern-web-guidance at commit `4dd968349e54ca45a05dd5c818fb035c9054b022`. Files were installed with the Codex skill-installer GitHub helper; upstream skill contents are preserved. Apache 2.0 LICENSE and THIRD_PARTY_NOTICES are included beside the packs, copied from the official npm distribution.
- Exact development CLI `modern-web-guidance@1.0.0`, corpus version `2026_11_09-5bcc021b`, locked by npm integrity. Offline semantic search and guide retrieval work after `npm ci --ignore-scripts`. The installed corpus has 209 guide documents; the default policy currently exposes 208 eligible catalog entries.
- Exact `chrome-devtools-mcp@1.12.0`, available to development coding clients through project `.codex/config.toml` and `.mcp.json`. This provides browser automation, accessibility snapshots, console/network inspection and performance tooling. See https://developer.chrome.com/docs/devtools/agents and https://github.com/ChromeDevTools/chrome-devtools-mcp .

## Use

Start a fresh Codex or Claude coding session **from the Trace repository root** so it discovers the project instructions, skills and MCP configuration. Codex project config requires a trusted project; Claude may request enabling the project server. Existing conversations do not automatically gain newly installed tools. AGENTS.md and CLAUDE.md describe the workflow.

```sh
npm run web:guidance -- search "accessible dialog"
npm run web:guidance -- retrieve dialog
npm run web:guidance -- list
npm run check:web-guidance
npm run check:chrome-mcp
```

Search one generic capability at a time, select IDs from returned descriptions, then read retrieved guides fully. Large guides are written to a temporary file: read that file in full. The project wrapper pins the local CLI and sets `DISABLE_TELEMETRY=1`; use it instead of upstream `npx @latest` examples. Do not use the raw CLI installer/updater from routine development commands.

`.mwgrc` sets Baseline Widely available, origin trials off and volatile features off. Preserve React/Electron behavior and progressive fallbacks. Use the extension pack only for actual browser-extension work. Run legacy-scan only for a requested broad modernization audit, not routine installation validation. Check each result against its keep/drop conditions; a scan is not a full audit.

The Chrome wrapper fixes headless, isolated temporary profiles, usage-statistics off and CrUX field-data URL lookup off. It checks standard Chrome paths and existing Playwright Chromium caches; alternatively set `TRACE_CHROME_PATH` to an absolute Chrome executable before starting your coding client. If Chrome is absent, install Chrome separately; npm installation does not download a browser. The wrapper does not accept flags attaching personal profiles or existing debugging sessions. It does not make browser file/network access a security sandbox. Use synthetic data for development; do not open private case material without an explicit reason.

These packages and configs are development-only. Trace's in-product investigation agent continues to disable project skills, customizations and external MCP servers. This integration does not change its provider permissions or model access. No global coding-client configuration was changed.

## Verification and maintenance

`check:web-guidance` validates canonical/Claude discovery, licenses, exact dependency versions, policy, semantic search, retrieval including the large-file path and both MCP config entries. CI runs this after dependency installation. `check:chrome-mcp` is an explicit local browser check: it negotiates the real protocol, enumerates tools, opens only a synthetic data URL, reads its accessibility snapshot and closes the connection/browser. It requires Chrome and permission to spawn a browser; it is separate from browser-free CI.

On 2026-11-11: guidance check passed; Chrome MCP smoke passed with 32 tools; 63 tests across 10 suites passed; lint passed with existing warnings; web and Electron builds passed. No application UI changes or WCAG conformance claims are made by this tooling installation.

For an update, review the official release/source diff, choose an exact new source commit, replace both canonical skill directories with the official helper, and update the two exact npm dev dependencies/lockfile. Review license changes, corpus/CLI compatibility, project policy and MCP flags; run both checks, tests, lint and builds. Refresh the recorded versions here. Do not automatically install unreviewed `latest` content or opt into experimental browser features.
