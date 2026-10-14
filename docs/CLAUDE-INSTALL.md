# Claude installation

**Linux tested; native Windows not yet supported.** Windows path isolation and private-directory permissions need fixes before use. macOS and Claude Desktop remain unqualified.

Site Studio runs locally with Node 22 or newer. Claude Code 2.1.284 and 2.1.287 have been used for local verification. Site Studio sends tool results to your client; consult its data settings before selecting confidential content.

## Claude Code

Version 0.1.10 is distributed as a GitHub release archive and through the repository's own plugin marketplace (see [Load the local plugin for Claude Code commands](#load-the-local-plugin-for-claude-code-commands)); installing from that marketplace does not depend on any public plugin directory. Download `toolsenabled-site-studio-0.1.10.zip` and its `.sha256` file from the published release, verify with `sha256sum -c toolsenabled-site-studio-0.1.10.zip.sha256` (the release notes print the same hash), and extract it outside the site and private state folders; it extracts to `site-studio/`. Use direct MCP registration below for tool-only clients, or load the extracted local plugin for slash commands. Neither route requires a marketplace listing.

Open a terminal in the site's project directory, then register the extracted server for that project only:

```sh
claude mcp add --scope local --transport stdio site-studio -- node /absolute/site-studio/mcp-web.js --site /absolute/site --data-dir /absolute/private-state --export-dir /absolute/new-export
```

The print-only `tools/mcp-config.mjs --client claude` helper also produces a local-scope registration command. Quote paths containing spaces as individual arguments. All folder values must be absolute; literal `~` values are refused. Runtime never downloads dependencies.

Local scope keeps the server out of unrelated projects. A session connection or `claude mcp list` can start it. Stop the existing connection before probing the same state directory, or use another state directory for a concurrent client.

The site must exist. The state folder must be new or empty, private and outside the site, export folders and installation. The export destination must be new (or the original site folder) with an existing parent, outside the installation; startup refuses a missing parent, and an existing destination other than the original is refused when the export is confirmed. Configuring that destination does not authorize export: the dashboard still requires human confirmation.

Ask Claude to read the site before making focused edits, verify the result and save a checkpoint. The human must open the private one-time launch link before assigning that work. The included workflow skill documents the same boundary; host tool permissions determine whether other tools can bypass it.

## Open the human dashboard before assigning work

The human must open the one-time link **before giving the agent work**. Find the line beginning `Site Studio dashboard session:` and open the complete URL, including `#cap=…`, privately in a browser. It is emitted on stderr, not as an MCP tool result. Claude Code may label it an `error` log entry even when startup succeeded. Do not paste it into chat or ask the agent to retrieve it.

| Host | Where the human finds the launch line |
| --- | --- |
| Claude Code 2.1.284 on Linux | `~/.cache/claude-cli-nodejs/<cwd-slug>/mcp-logs-site-studio/<timestamp>.jsonl` for the direct registration used by this release. The slug identifies the project directory. Plugin registration uses `mcp-logs-plugin-toolsenabled-site-studio-site-studio/` instead. |
| Claude Code on other platforms, or an explicit log destination | Start with `claude --debug-file /absolute/private/site-studio-debug.log`; inspect that private debug file for the server's stderr line. Do this before submitting a prompt. |
| Claude Desktop on macOS | Settings → Developer → the Site Studio server logs, or `~/Library/Logs/Claude/mcp-server-<NAME>.log`; select the actual registered server name. |
| Claude Desktop on Windows | Settings → Developer → the Site Studio server logs, or `%APPDATA%\Claude\logs\mcp-server-<NAME>.log`. Native Desktop qualification is still pending. |
| Codex CLI | For the TUI, configure a private `log_dir` and inspect `<log_dir>/codex-tui.log`; that TUI discovery route has not been verified here. The verified Codex 0.158.0 app-server route uses `RUST_LOG=codex_rmcp_client=info` and captures app-server stderr in a private file before starting model work; app-server produced no log files from `log_dir` alone. |
| Cursor | View → Output → **MCP Logs**, then find the Site Studio server's stderr line. |
| DeepSeek Harness | The terminal running the Harness, or the stderr log explicitly chosen by its human launcher. Its default stdio transport inherits stderr; no fixed per-server log file is promised. |
| Direct `node mcp-web.js` or `node web-server.js` | The terminal running that process, on stderr. |

The Claude Code Linux path was verified with this client build. The Codex app-server stderr route was verified separately; the TUI route is documented but unverified here. Other host locations follow their documentation: [Desktop server logs](https://py.sdk.modelcontextprotocol.io/get-started/real-host/), [Codex log configuration](https://developers.openai.com/codex/config-reference/), [Cursor MCP logs](https://prod.cursor.com/help/customization/mcp), and the [Harness stdio transport](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/transport.ts). The Harness location is inferred from its inherited stderr transport; native host link discovery still needs qualification. Protect the selected log directory with your account's filesystem permissions.

**The agent's file or shell tools can read these host logs if their permissions allow it.** Some hosts create logs readable by other local users; Site Studio does not control those modes. A stolen unused link can be consumed before the human uses it. Opening it first consumes that secret, but this is not a sandbox against a same-user process or an agent that can read browser/session memory. Restrict the host's other tools and local account access; the skill's instruction alone cannot enforce this boundary.

For a replacement while you still have dashboard access, click **Renew dashboard session**. The same tab exchanges the new one-time link immediately and remains usable after reload. To transfer access, choose **Move to another browser** and open or copy the displayed link; that pending link survives reload in the originating tab. This authenticated human action revokes the previous dashboard token, launch secret and preview capability. It is absent from MCP. When moving browsers, open the replacement before resuming agent work. If the link was lost or consumed elsewhere and you have no dashboard session, stop the host's Site Studio MCP connection, verify that its process has exited, and restart that connection with the same absolute site/state/export options. Open the newest launch line from the host location above. Saved working-copy state survives; old process URLs cannot authorize the replacement process. Never remove a live lease to force a second server to start.

## Other clients

The included Codex plugin manifest keeps its sample-default configuration inline in `.codex-plugin/plugin.json`, independent of Claude’s folder-option substitution. Codex explicitly forwards `SITE_STUDIO_ROOT`, `SITE_STUDIO_DATA` and `SystemRoot` through `env_vars`; set both to absolute paths when using a configured site instead of the bundled sample. Without these optional variables, Site Studio constructs absolute sample/state defaults. Claude Code and Desktop explicitly map the selected site/state folders into their launch environment as well as literal arguments. Codex passes an MCP process only a small default set of variables, such as `HOME` and `PATH`, and those listed in `env_vars`; Claude Code passes its own environment to plugin servers (see the [README](../README.md#mcp-server)). This plugin configuration has no export destination, so export is disabled. To enable human export, register the server directly with `--export-dir` using the print-only helper. The helper supports Codex, Cursor, Claude Desktop and DeepSeek Harness. See [README](../README.md) for commands and runtime boundaries.

## Claude Desktop bundle

Build with a separately installed, pinned mcpb 2.1.2 CLI:

```sh
node /absolute/mcpb/dist/cli/cli.js validate manifest.json
python3 tools/package-mcpb.py --mcpb-cli /absolute/mcpb/dist/cli/cli.js --output /outside/site-studio-a.mcpb
python3 tools/package-mcpb.py --mcpb-cli /absolute/mcpb/dist/cli/cli.js --output /outside/site-studio-b.mcpb
```

Compare the unsigned files before signing. The builder stages the explicit package allowlist without changing its files. Registry metadata is excluded from the source, ZIP, Desktop bundle and marketplace plugin. It calls the unmodified CLI with a fixed process clock (2026-01-01 UTC) and normalizes file modes. Plain `mcpb pack` uses wall-clock timestamps. Signatures contain their own time and randomness; signed-byte reproducibility is not claimed. Keep artifacts, build dependencies and private signing keys outside the plugin tree.

The supplied development signature is not a production publisher identity. Development certificates must have `basicConstraints=critical,CA:FALSE`, `keyUsage=digitalSignature` and `extendedKeyUsage=codeSigning`. Generate the temporary key outside source, packets and synchronized folders with restrictive permissions; delete it after signing and export only the public certificate. Never install a development certificate into an OS trust store. The stock mcpb 2.1.2 verifier is known to fail because its PKCS#7 implementation is incomplete. Independent OpenSSL CMS verification and rejection of a tampered payload can verify the signature against the development certificate, but do not establish OS trust or Desktop acceptance. Do not treat the stock verifier failure as a successful check.

After a qualified Desktop release exists, open its `.mcpb` in Claude Desktop on macOS or Windows, select the three folders and review permissions. Native Desktop installation has not been tested on this headless Linux host. Including SKILL.md does not establish automatic skill loading in Desktop. Claude.ai chat does not run this local server.

## Registry and directory status

This release is distributed from GitHub: the verified release archive and the repository's own Claude Code and Codex marketplaces. MCP Registry and public plugin-directory publication are not done; the tooling below is for a later qualified publication.

`server.json` is generated separately by the publisher at release time from the final production-signed artifact. It is never committed to the plugin or included in its ZIP, Desktop bundle or marketplace tree. The release URL must exist and its downloaded bytes must match the recorded digest; DNS namespace verification and production signing require the publisher’s action. Schema validity does not prove that URL is downloadable. Directory acceptance is separate: compact inherited JavaScript and generated entity tables may be held for review even though the source has no dependencies or binaries. Local validation is not portal acceptance.

Publisher tooling: `python3 tools/generate-release.py --help` describes the external sidecar generator. Run it only after the source is pushed/tagged and the production-signed bundle is uploaded. Supply `--expected-tree` with the full reviewed tree hash. It verifies the remote tag’s peeled commit and tree, every allowlisted bundle member against that commit, the exact member set and downloaded signed bytes before writing SOURCE-PINS, a GitHub entry with ref/sha, and Registry metadata outside the checkout. Re-importing patches changes commit IDs: preserve the reviewed bundle history or regenerate these files from the actual pushed commit. Candidate commit IDs are never public release pins.

For offline packets, `python3 tools/handoff.py verify /absolute/packet` checks the exact SHA256SUMS inventory and scans all files, nested archives and reachable Git bundle blobs for private-key headers. `copy SOURCE NEW_DESTINATION` transfers only verified inventory entries and repeats the checks. Compare the inventory hash with the publisher’s expected value first. These checks do not authenticate an unknown publisher or detect every form of secret. Build caches, test homes, logs and signing workspaces belong outside transfer packets.

For Site Studio’s Registry entry, pass `--description "Edit static sites in a private working copy with preview, checkpoints and human-controlled export."`. This complete description is used verbatim. The generator refuses a description longer than 100 characters; it never shortens a public listing automatically.

## User commands

| Claude Code command | Kind | Purpose | Codex equivalent |
| --- | --- | --- | --- |
| `/site-studio` or `/site-studio home` | Pane | Revision, pause/lease state, undo depth, budgets and recent history | `!node /absolute/site-studio/tools/site-studio-view.js home` |
| `/site-studio pages [--assets]` | Pane | Page titles, node counts and sizes; --assets includes other files | `!node /absolute/site-studio/tools/site-studio-view.js pages [--assets]` |
| `/site-studio page "path"` | Pane | Outline, CSS rules and bounded source; asset metadata only | `!node /absolute/site-studio/tools/site-studio-view.js page "path"` |
| `/site-studio find "text"` | Pane | Case-folded matches, line numbers and bounded context | `!node /absolute/site-studio/tools/site-studio-view.js find "text"` |
| `/site-studio history` | Pane | Saved timeline with UTC times, actors, types and revisions | `!node /absolute/site-studio/tools/site-studio-view.js history` |
| `/site-studio checkpoints` | Pane | Saved labels and counts of changed files | `!node /absolute/site-studio/tools/site-studio-view.js checkpoints` |
| `/site-studio changes ["label" or original] ["path"]` | Pane | Changed files since the latest checkpoint (the default baseline), a named checkpoint or `original`, with a bounded line replacement diff | `!node /absolute/site-studio/tools/site-studio-view.js changes ["label"] ["path"]` |
| `/site-studio check` | Pane | Missing local HTML/CSS targets and unlinked pages; no network | `!node /absolute/site-studio/tools/site-studio-view.js check` |
| `/site-studio dashboard` (alias `preview`) | Pane | Human dashboard instructions and current lease status | `!node /absolute/site-studio/tools/site-studio-view.js dashboard` |
| `/site-studio export` | Pane | Advisory destination, lock and drift checks; never exports | `!node /absolute/site-studio/tools/site-studio-view.js export` |
| `/site-studio doctor` | Pane | Saved-state/startup checks and manual recovery guidance; no repair | `!node /absolute/site-studio/tools/site-studio-view.js doctor` |
| `/site-studio help` | Pane | Paged command names and their Codex equivalents | `!node /absolute/site-studio/tools/site-studio-view.js help` |
| `/toolsenabled-site-studio:site-studio-edit <request>` | Action | Inspect, edit and verify the working copy | `$toolsenabled-site-studio:toolsenabled-site-studio edit <request>` |
| `/toolsenabled-site-studio:site-studio-new-page <path> <title>` | Action | Add and verify a named HTML page | `$toolsenabled-site-studio:toolsenabled-site-studio new-page <path> <title>` |
| `/toolsenabled-site-studio:site-studio-checkpoint <label>` | Action | Save an agent checkpoint; refused while paused | `$toolsenabled-site-studio:toolsenabled-site-studio checkpoint <label>` |
| `/toolsenabled-site-studio:site-studio-draw <path.svg> <description>` | Action | Author a safe SVG asset; reference it only if requested | `$toolsenabled-site-studio:toolsenabled-site-studio draw <path.svg> <description>` |

Claude Code panes require the local plugin loaded in Code 2.1.287 or newer; a direct MCP registration alone does not load them. Views start only the installed read-only runtime child, never MCP tools or model work. Use n/p to page, r to reload, 1–8 for row detail (b returns), and Esc or q to close. The pane keeps the keyboard while open: a key that does not apply in the current state shows a short hint instead of reaching the prompt, and the footer lists only the keys that apply. The pane shows the revision and a short snapshot digest. A saved-state change clears stale pages. Text is sanitized and truncated; these are summaries, not a full source viewer. No automatic polling, lease acquisition, state writes or launch-log reads occur.

Use the **fully qualified action names** above. In the tested 2.1.287 build, the unprefixed action names do not resolve. Actions start normal model work and retain host permissions. Pause, undo, restore and export remain human dashboard actions.

Codex has no plugin-defined slash-command pane API in the tested client. The bang commands above are an explicit local CLI alternative, not a Codex pane. Replace `/absolute/site-studio` with the extracted plugin path. Set `SITE_STUDIO_ROOT` and `SITE_STUDIO_DATA` to the same absolute paths as the MCP server, or append `--site /absolute/site --data-dir /absolute/private-state` to each command. Append `--export-dir /absolute/export` to display that configured destination. Absent both explicit and environment paths, the CLI uses the server's bundled sample and `~/.site-studio/<site-hash>` defaults. It never searches for another running server or creates a missing state folder; it displays “not opened yet”. Use `--allow-external` only to match a server started with that policy. For later pages it prints the exact `--offset` and `--snapshot` flags to add. Codex may include bang-command output in subsequent model context; Claude pane bodies stay outside it. The Codex skill name is the plugin name followed by the skill folder name, `toolsenabled-site-studio:toolsenabled-site-studio` with this release's manifest; the 0.1.3 name `site-studio:toolsenabled-site-studio` was verified with no-model `plugin/read`, and the renamed form has not been re-verified in a Codex client. Skill equivalents require that plugin/skill to be loaded and are model actions, not instant views. For a Codex plugin installed from the repository marketplace, its cache path is `<CODEX_HOME>/plugins/cache/<marketplace>/toolsenabled-site-studio/<version>/`; obtain the literal path from the client's plugin details. GitHub extraction can use any selected absolute folder.

## Load the local plugin for Claude Code commands

Install from the repository marketplace, or use the verified extracted GitHub folder directly. From the marketplace:

```sh
claude plugin marketplace add ToolsEnabled/toolsenabled-site-studio
claude plugin install toolsenabled-site-studio@toolsenabled-site-studio --config site_directory=/absolute/site --config data_directory=/absolute/private-state --config export_directory=/absolute/new-export
```

`claude plugin configure toolsenabled-site-studio@toolsenabled-site-studio` shows those options later, and changes them when you pipe a JSON object of the three values to it with `--values-stdin` (or use `/plugin configure` inside Claude Code). A marketplace-installed plugin loads in every session without `--plugin-dir`. Stop/remove a duplicate direct MCP registration for the same state directory before loading the plugin. For the extracted folder instead, merge these nonsecret folder options into `.claude/settings.local.json` in the project (preserve any existing settings):

```json
{
  "pluginConfigs": {
    "toolsenabled-site-studio": {
      "options": {
        "site_directory": "/absolute/site",
        "data_directory": "/absolute/private-state",
        "export_directory": "/absolute/new-export"
      }
    }
  }
}
```

Then start `claude --settings /absolute/project/.claude/settings.local.json --plugin-dir /absolute/site-studio` from that project. Passing the settings path explicitly also works before the client has trusted project-local settings. The plugin starts its configured MCP connection and registers its views/actions. Open the human dashboard link privately before assigning work. `/site-studio help` lists commands. Keep the local folder options with that project; use different state folders for parallel clients. A missing required option refuses plugin loading instead of selecting another site's state. Native terminal painting, permission prompts and composer restoration need a real interactive-client check; headless hook tests alone do not prove them.
