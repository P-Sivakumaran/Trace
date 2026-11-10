# Trace development

Read DESIGN.md and the relevant docs before changing architecture. Preserve the case agent's provider, tool, MCP and customization isolation; these development skills and servers must never be passed into investigation inference.

For HTML, CSS and client JavaScript work, first read `.agents/skills/modern-web-guidance/SKILL.md`. Search generic 2–5 word capabilities, match descriptions, retrieve the relevant IDs and read the full guidance before implementing. Use `npm run web:guidance -- search "accessible dialog"` and `npm run web:guidance -- retrieve dialog`, rather than upstream `npx @latest` examples: this project pins the CLI and disables query telemetry. Use `.mwgrc`: Baseline Widely available, origin trials and volatile features off. Adapt guidance to React and Electron, preserve behavior and use progressive enhancement. Do not run legacy-scan merely to check an ordinary change; use it for an explicitly broad modernization audit. Record applied guide IDs and the concrete changes/validation in the development report.

Read `.agents/skills/chrome-extensions/SKILL.md` only for actual browser-extension work. Trace is an Electron app; this pack does not justify adding extension permissions or a manifest.

Chrome DevTools MCP is configured for development in `.codex/config.toml` and `.mcp.json`. Launch your coding client from this repository root. The server uses a temporary headless browser profile, no usage statistics and no CrUX URL lookup. Use synthetic fixtures for evidence/case data. Browser tools retain normal file/network powers and are not a security sandbox. Do not attach a personal profile or enable these tools for Trace's case agent.

Run `npm run check:web-guidance`, relevant tests, lint and builds. Browser integration: `npm run check:chrome-mcp` with Chrome installed (or absolute TRACE_CHROME_PATH). Guidance is advisory; it does not certify WCAG conformance or replace manual keyboard/screen-reader testing. See `docs/modern-web-guidance.md` for installation, provenance and updates.
