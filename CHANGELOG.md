# Changelog

## 0.1.11 — Windows candidate, not released

- Prepare native SID/DACL private state, canonical Windows root/lock identity and explicit namespace refusals.
- Prepare a PowerShell pane bootstrap that clears the environment before Node, and a per-user ZIP installer.
- Windows is gated and unqualified until real normal-user, filesystem, lifecycle, pane and host checks pass. Linux behavior remains covered by its existing suite.

## 0.1.10 — 2026-10-14

Fixes for the plugin directory's review and for the fresh-user check of 0.1.9. The server, tools, pane and mod behave as in 0.1.9, and no feature was removed:

- The Claude Code plugin's `.mcp.json` and the Desktop `manifest.json` no longer copy `SystemRoot` from the host into the server's environment. Claude Code starts plugin servers with its own environment, so the server still sees `SystemRoot` wherever it is set; on Linux the entry was empty, and the server reads it only on Windows, which is not supported. The Codex manifest still forwards it by name, and docs/CLAUDE-INSTALL.md no longer says that a host never passes its environment to an MCP process.
- Tests only, the same checks: the second loopback server that sets cookies in the browser cookie test moved into `test/session-helper.js`; the reviewed tool-annotations test moved from `test/lifecycle.test.js` into `test/tool-annotations.test.js`; two preview-cache checks in `test/delta.test.js` run their child programs from `test/preview-cache-worker.js` instead of inline program text.
- `tools/generate-release.py`, a maintainer script, reads the release file through the new `tools/release_fetch.py`; it still only compares the downloaded bytes.
- The test runner test no longer fails with a `TMPDIR` of 37 to 62 bytes: it held its own temporary folder, 26 bytes longer than `TMPDIR`, to the 62-byte limit.
- The Python test workers no longer leave `tools/__pycache__` behind, and the test checks it.
- The Codex manifest's description now matches the Claude Code listing: "Edit static sites in a private working copy, with checkpoints, local preview and human-controlled export."
- README: the `claude plugin configure` form that sets the three folders (`--values-stdin`, or `/plugin configure` in Claude Code); the marketplace installs `main`, which each release moves to its release commit; the client helper names the absolute Node.js path, so rerun it after changing Node.js; one plain sentence for each directory notice that stays (the pane's program and its command, and the publisher's name); every host the tests name, and which test processes get a reduced environment and which the test runner's. docs/TESTING.md says the archive holds every tracked file except the directory's listing image.

## 0.1.9 — 2026-10-13

Codex self-distribution fixes; the server, tools, pane and mod are unchanged:

- Codex no longer tries to read `hooks/hooks.json`, the Claude Code `/site-studio` mod, as a Codex hook file, which it cannot parse. `.codex-plugin/plugin.json` declares `"hooks": {}`; an explicit `hooks` value replaces Codex's default hooks-file discovery, and an empty one adds no hooks. Claude Code is unaffected.
- The Codex listing in `.codex-plugin/plugin.json` gains `interface.websiteURL` (https://toolsenabled.ai/site-studio/), `supportURL` (https://toolsenabled.ai/support/) and `privacyPolicyURL` (https://toolsenabled.ai/privacy/), and `developerName` is "ToolsEnabled, Inc.", as in `author`.
- `test/claude-package.test.js` now also pins the empty `hooks` object, the publisher and the three listing links; the suite runs the same tests as 0.1.8.

## 0.1.8 — 2026-10-13

Directory-compliance fixes; the server, tools and pane are unchanged:

- README: a "Try it" section gives the shortest path from nothing to a working result: copy the bundled sample site, make a private state folder, install the plugin with the three folder options, then three prompts (list the pages, change the headline and save a checkpoint, `/site-studio history`), each with the result it shows. No account or API key is needed. It replaces the one-line example under "Connect a client".
- SECURITY.md cites this repository's LICENSE (MIT) for "as is". https://toolsenabled.ai/terms/ covers only Fleet and the website.
- The skill no longer gives the model the path of the log that holds the one-time dashboard link. It tells the human to find the `Site Studio dashboard session:` line in their MCP host's log, as the README explains; the rest of the skill is unchanged.

## 0.1.7 — 2026-10-13

Fixes the five findings of a code review of 0.1.6:

- Links written without quotes and ending in `/`, such as `<a href=/blog/>` in minified site output, are read the way browsers read them. Before, Site Studio took that last `/` as the end of the tag: setting an attribute on such a link changed its target (`/blog/` became `/blog`), removing the element left its closing `</a>` behind, and setting its text failed with "node is not paired". Tags that really end in `/`, such as `<br/>` or `<img src="a.png"/>`, are read as before.
- On a large site the newest undo state is no longer dropped. Every undo state is a full copy of the site, and with 24 MiB or more of files a single edit used to leave the dashboard with no Undo and no warning. Older undo and redo states are still dropped first to keep the saved state near 96 MiB; the newest undo and the newest redo state are dropped only when the saved state would otherwise exceed its 128 MiB limit, and then the result of that edit or action, and the dashboard, say so (`undoPruned`).
- An SVG drawing made with `web_draw` displays as an image file even when its source leaves out the SVG namespace: `xmlns="http://www.w3.org/2000/svg"`, and `xmlns:xlink` when `xlink:href` is used, are added to the root when missing. Before, such a file was accepted and then showed as a broken image in the preview and in the exported site.
- A checkpoint can no longer be named `original` (in any letter case), because `changes original` means the opened working copy; before, a checkpoint with that name could not be chosen in the changes view. A saved checkpoint that already has the name is shown as "Imported checkpoint".
- If the very first start in a new state folder was killed before it saved its state (for example by a power loss), the next start no longer refuses the folder as "not empty". It removes the half-written working copy and temporary state file, with a one-line notice, but only when they hold nothing but a copy of the site; anything else is refused and kept as before. `doctor` names such leftovers instead of reporting a non-empty folder.

## 0.1.6 — 2026-10-13

- The test runner (`node tools/run-tests.js`) checks `TMPDIR` before it starts any test and stops with a message that names the problem: `TMPDIR` must be the absolute real path of an existing folder, not one reached through a symbolic link, and at most 62 bytes long. Before, a longer `TMPDIR` made Chrome exit because its lock socket path did not fit the Unix limit, and the fifteen browser tests failed with a bare `read ECONNRESET`; a relative or linked `TMPDIR` made the working-copy store refuse its copy with `symbolic link refused` (a deliberate guard) in many tests. The browser helper repeats the length check when a browser test file is run on its own.
- The README's development section and `docs/TESTING.md` say how to set `TMPDIR` for the tests and why. A new test checks that the runner stops on each kind of unusable `TMPDIR`.
- The plugin itself (MCP server, tools, views, pane, export) is unchanged from 0.1.5.

## 0.1.5 — 2026-10-13

- Declare MCP annotations on every tool: a short title, `readOnlyHint` and `destructiveHint`, `idempotentHint` for the nine tools that change the working copy or its checkpoints, and `openWorldHint` (false for every tool). Seven tools only read; the nine that change things are marked destructive. Tool names, inputs and behavior are unchanged, and a test pins every value.
- Add the README section "What this plugin runs, sends and reads": the MCP server's command and what it reads, writes and sends; what each `/site-studio` pane hook does; the one program the pane starts, with its full command; what that program reads; the commands and skill; the tests the plugin directory flags; and the one maintainer script that uses the network.
- Add the plugin directory's listing icon to the repository. It is not part of the release archive.
- Set the plugin directory's listing links in the Claude plugin manifest (documentation, privacy policy and support pages), use the product page https://toolsenabled.ai/site-studio/ as the homepage in the Claude, Codex and Desktop manifests, and link the privacy policy at https://toolsenabled.ai/privacy/.
- Say that installing from the repository's own marketplace does not depend on any public plugin directory, instead of saying that public plugin directories are not used (README and install guide).
- Describe agent export in the README and `docs/EXPORT-GATE.md` as a proposed design that is not implemented, without internal decision wording.
- Tests: the browser, MCP server and timed Node processes that the tests start get only `PATH`, the temporary-folder variables, `SystemRoot` on Windows and, for the browser, `HOME`, and the test files the plugin directory flagged read no environment variables. The package test also checks the `.claude-plugin` folder and still passes in an extracted archive.

## 0.1.4 — 2026-10-13

- Refuse startup when the `--export-dir` parent folder does not exist, before any state is created; an existing destination is still checked when the human confirms export, so a server can restart after exporting.
- Name the baseline of the `changes` view (latest checkpoint by default, a named checkpoint, or `original`) in its first row and in the command tables, and say when nothing changed since it instead of showing an empty list.
- Refuse non-absolute folder paths on Linux and macOS with a plain "requires an absolute path" message; the drive-or-share wording appears only on Windows.
- Make the repository its own plugin marketplace for Claude Code (`.claude-plugin/marketplace.json`) and Codex (`.agents/plugins/marketplace.json`), ship both files in the archive, and document the marketplace add and install commands.
- Name the Codex plugin `toolsenabled-site-studio` like the Claude manifest and add its homepage, repository and license fields; the Codex skill name becomes `toolsenabled-site-studio:toolsenabled-site-studio`.
- Ship the company-wide security policy and safe harbor at the top of SECURITY.md, with this release's security boundaries kept below it.
- Document release verification (`sha256sum -c` against the `.sha256` asset, `unzip`, extracts to `site-studio/`), date the 0.1.3 entry, and record the 0.1.3 and 0.1.4 full-suite results in the test report.

## 0.1.3 — 2026-10-13

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
