# Trace development instructions

Follow @AGENTS.md. The official skill packs are available in `.claude/skills/` through aliases to `.agents/skills/`. Use the pinned, telemetry-disabled `npm run web:guidance -- ...` commands. The project `.mcp.json` supplies the isolated development Chrome DevTools server; restart Claude Code in this project after installation and enable the project server when the client asks. Never pass project MCP or skills into the investigation agent.
