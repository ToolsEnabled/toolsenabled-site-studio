# Changelog

## 0.1.0 — 2026-10-01

- Edit static websites through sixteen local MCP tools with revision checks and Unicode search that preserves original offsets.
- Keep originals separate from the private working copy until confirmed export; preserve binary assets, persist bounded history, and detect changes to originals.
- Review changes in a script-free preview; pause, undo, redo, save checkpoints, restore the opened copy, and export through the dashboard session.
- Cache preview transformations, apply referrer protections, and handle malformed imported markup conservatively.
- Scan CSS rules and index HTML linearly, preserve CSS replacement after comments and at-rules, validate authored content, and test every runtime regex with adversarial inputs.
- Keep dashboard access available with held sockets and release startup leases on cancellation.
- Print registration configurations for Claude Code, Codex, Cursor, Claude Desktop, and DeepSeek Harness.
- Include a two-page sample, headless tests with documented browser prerequisites, and reproducible packaging tools.
