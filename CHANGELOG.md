# Changelog

## 0.1.3 — Unreleased

- Add Claude Code panes for working-copy status, pages and source, search, changes, references, history, checkpoints, startup diagnostics and human dashboard/export guidance, with bounded local reads, snapshot paging and terminal sanitization.
- Add explicit edit, new-page, checkpoint and SVG action commands using ordinary model and tool permissions; document exact command names and Codex CLI/skill equivalents.
- Diagnose missing or non-empty state folders and missing source/export parents without creating or repairing anything.
- Record UTC times for new activity and show unavailable times honestly for older history.
- Forward Windows SystemRoot explicitly to MCP servers and document the clear refusal when it is absent.
- Refresh test-report facts and document the separate hook, native command-resolution and real-terminal qualification gates.
- Start the pane reader through an emptied environment holding only PATH, so client credentials and other variables are not inherited.
- Keep every advertised pane key (n, p, r, b, 1–8, q) claimed in every pane state with a short hint where it does not apply, open the pane as a dialog, and list only the keys that apply.
- Show where a change starts (line and column) when it lies deep inside a long line, and say when the change is in hidden characters or beyond the first 64 KiB.
- Find the server's default state folder from Codex views when SITE_STUDIO_ROOT ends with a path separator.
- Show the same required arguments in the help pane's Codex column as in the Claude command (page, find, changes and pages --assets).
- Declare Linux as the only manifest platform and label the remaining Windows runtime and test instructions as not yet supported.

## 0.1.2 — 2026-10-02

- Add a reproducible unsigned Desktop bundle builder and manifest; keep release-time Registry metadata outside plugin artifacts and document development-signature, verifier and native-platform limits.
- Add a Claude Code plugin with absolute folder configuration, project-local installation and a workflow skill; use inline Codex configuration and preserve other client helpers.
- Keep long Unicode searches linear when folded matches cross character boundaries, and preserve fast search around newer Unicode characters.
- Bound preview output and decoded XML entities; keep dense pages, omit oversized attributes individually, and show preview omissions or failures on the dashboard.
- Preserve legacy HTML attribute references without a semicolon while escaping the resulting value once.
- Rotate preview capabilities on dashboard load and repair cookie interference through the authenticated dashboard, with bounded automatic retries and manual refresh.
- Renew dashboard sessions without losing access on reload, preserve explicit browser-move links, and explain host log discovery and same-user access limits.
- Recover crashed state-lease owners using process creation identity within the same host and PID namespace, compare POSIX start times in UTC, and preserve other contenders’ recovery claims; keep state and exports outside the installation.
- Add adversarial time and memory checks, reliable browser interception and cookie recovery tests, and release bundles tied to reviewed source trees, and packet scans covering compressed archives and Git blobs, with nested Git bundles refused.

## 0.1.1 — 2026-10-01

- Authenticate preview reads with a separate HttpOnly, SameSite=Strict cookie; preview URLs contain no read capability and cookies never authorize dashboard actions.
- Rebuild preview opening tags with escaped attributes and escape retained HTML RAW text; keep referrer protections and document their limits.
- Parse UTF-8 SVG as XML, preserve CDATA styling, and support bounded literal internal entities used by Illustrator namespace declarations.
- Preserve legacy HTML rendering modes and named attribute entities in previews while keeping original export bytes.
- Find overlapping whole-character Unicode matches, reject surrogate-splitting results, and accelerate searches over dense full-fold exceptions.
- Respect CSS escapes outside strings so selector edits replace the intended rule.
- Expand browser, authorization, XML and adversarial performance coverage; clarify cookie isolation and platform qualification limits.

## 0.1.0 — 2026-10-01

- Edit static websites through sixteen local MCP tools with revision checks and Unicode search that preserves original offsets.
- Keep originals separate from the private working copy until confirmed export; preserve binary assets, persist bounded history, and detect changes to originals.
- Review changes in a script-free preview; pause, undo, redo, save checkpoints, restore the opened copy, and export through the dashboard session.
- Cache preview transformations, apply referrer protections, and handle malformed imported markup conservatively.
- Scan CSS rules and index HTML linearly, preserve CSS replacement after comments and at-rules, validate authored content, and test every runtime regex with adversarial inputs.
- Keep dashboard access available with held sockets and release startup leases on cancellation.
- Print registration configurations for Claude Code, Codex, Cursor, Claude Desktop, and DeepSeek Harness.
- Include a two-page sample, headless tests with documented browser prerequisites, and reproducible packaging tools.
