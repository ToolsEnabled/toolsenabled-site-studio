# ToolsEnabled Site Studio 0.1.8

**Linux-only release.** Linux is tested; native Windows is not yet supported. Windows path isolation and private-directory permissions need fixes before use. macOS and native desktop-client installation remain unqualified.

Edit a static website through any MCP host. Site Studio makes a private working copy, provides a live browser preview, and keeps revision history and named checkpoints. The human controls pause, undo, restore, and export. Your original folder stays unchanged until you explicitly confirm an export to it.

Node.js **22 or newer** is required, together with the local filesystem and process-identity support described under Limits below. There is no npm install step, hosted service, account, model provider, or publishing integration.

## Start

Download `toolsenabled-site-studio-0.1.8.zip` and `toolsenabled-site-studio-0.1.8.zip.sha256` from the [v0.1.8 release](https://github.com/ToolsEnabled/toolsenabled-site-studio/releases/tag/v0.1.8) into the same folder. Verify the archive against the `.sha256` file (the release notes print the same hash), extract it (it extracts to `site-studio/`), and start from that directory:

```sh
sha256sum -c toolsenabled-site-studio-0.1.8.zip.sha256
unzip toolsenabled-site-studio-0.1.8.zip
cd site-studio
node mcp-web.js --site /absolute/path/to/static-site --data-dir /absolute/path/to/private-state --export-dir /absolute/path/to/finished-site
```

The export parent must already exist; startup refuses a missing parent before creating any state. The destination must be a new folder, or the original site folder itself. An existing destination other than the original is refused when the export is confirmed, not at startup, so that a server can restart after an export; `node tools/site-studio-view.js export` (the `/site-studio export` pane in Claude Code) reports the destination's readiness in advance. The state folder must be new or empty, outside the original/export folders and plugin installation, and dedicated to Site Studio. Existing state folders require private permissions (`chmod 700` on Linux/macOS).

This command starts the **stdio MCP server** and two loopback listeners: a human dashboard and a separate site preview. A one-time dashboard session link is written to local stderr diagnostics. Before giving the agent work, find and open that private link once; the page removes the fragment secret from the address bar, exchanges it once by POST, and keeps the session token in sessionStorage for that browser tab and exact origin. Dashboard requests carry a required session header. A separate HttpOnly cookie grants preview reads only; it never authorizes dashboard controls. `web_preview` returns only the clean URL and the preview origin, never a session or preview capability. Open the private dashboard link to view the site. MCP JSON stays on stdout. Without `--site`, the included two-page Fieldwork sample opens in a private copy. Without `--data-dir`, state lives in `~/.site-studio/<site-identifier>`. `SITE_STUDIO_ROOT` and `SITE_STUDIO_DATA` are environment alternatives. Without `--export-dir`, export stays disabled.

For browser-only operation, replace `mcp-web.js` with `web-server.js`. One process owns each state directory: do not launch browser-only mode alongside MCP on the same state directory. Close the MCP host or send EOF/SIGINT/SIGTERM/SIGHUP to stop; both listeners and the lease are released. Startup import also responds to shutdown between bounded file operations.

## Connect a client

Print the appropriate registration command or configuration:

```sh
node tools/mcp-config.mjs --client claude --site /absolute/path/to/static-site --data-dir /absolute/path/to/private-state --export-dir /absolute/path/to/finished-site
```

Client configuration helpers: Claude Code, Claude Desktop, Codex, Cursor, DeepSeek Harness. Select the corresponding `--client` value: `claude`, `claude-desktop`, `codex`, `cursor`, `deepseek`. Claude Code and Codex receive shell commands; Cursor and Claude Desktop receive `mcpServers` JSON; DeepSeek Harness receives a Cordis plugin row in YAML for placement under `- insert:` in a profile overlay. Run the printed command or merge the configuration into your client. The helper never changes settings. PowerShell output is retained for future Windows qualification. Use a different state directory for simultaneously running clients.

The archive and the repository contain separate Claude Code and Codex plugin manifests, and the repository is its own plugin marketplace for both clients: `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` each list the one plugin `toolsenabled-site-studio`. Claude Code installs it in two steps; supply the three folder options at installation, or later with `claude plugin configure toolsenabled-site-studio@toolsenabled-site-studio`:

```sh
claude plugin marketplace add ToolsEnabled/toolsenabled-site-studio
claude plugin install toolsenabled-site-studio@toolsenabled-site-studio --config site_directory=/absolute/site --config data_directory=/absolute/private-state --config export_directory=/absolute/new-export
```

For Codex, add the same repository as a marketplace, then install ToolsEnabled Site Studio from it in the Codex `/plugins` directory:

```sh
codex plugin marketplace add ToolsEnabled/toolsenabled-site-studio
```

Claude Code uses `.mcp.json` with those three explicit folder options; Codex retains the sample-default configuration inline in `.codex-plugin/plugin.json`. The registration helper above remains available for other MCP hosts. The Claude Code marketplace add and install were exercised from a local clone with Claude Code 2.1.296 in a scratch configuration; the Codex marketplace file follows OpenAI's published repository-marketplace format and was not exercised in a Codex client for this release. Installing from this repository's marketplace does not depend on any public plugin directory. See [Claude installation and packaging](docs/CLAUDE-INSTALL.md).

## Try it

No account or API key is needed: Site Studio runs on your computer and calls no model or online service of its own. In the extracted release ZIP's `site-studio/` folder (or a clone), copy the bundled sample site and make a private state folder, then install the plugin with the three folder options (the export folder must not exist yet; its parent must):

```sh
mkdir -p /absolute/try && cp -r site /absolute/try/site && mkdir -m 700 /absolute/try/state
claude plugin marketplace add ToolsEnabled/toolsenabled-site-studio
claude plugin install toolsenabled-site-studio@toolsenabled-site-studio --config site_directory=/absolute/try/site --config data_directory=/absolute/try/state --config export_directory=/absolute/try/export
```

Start `claude`, open the one-time dashboard link from its MCP log to watch the preview (see [Review and save](#review-and-save)), approve each Site Studio tool call when asked, and try these three prompts:

1. `List the pages of my site.` Claude calls `web_pages` and lists `about.html`, `index.html` and `styles.css` at revision 0.
2. `Change the headline on index.html to "Hello from Site Studio", then save a checkpoint named first-edit.` Claude reads the page, replaces the `<h1>` text with `web_set_text` (revision 1) and saves the checkpoint `first-edit`. `/absolute/try/site` itself stays unchanged.
3. `/site-studio history` opens the read-only pane: `Opened working copy` at r0, then `Updated text · index.html` and `Saved checkpoint · first-edit` at r1.

See [all tools and examples](docs/MCP.md).

## What this plugin runs, sends and reads

This section covers everything the Claude Code plugin runs: its MCP server, its mod (the `/site-studio` pane), and its commands and skill. Site Studio itself contacts no online service: there is no ToolsEnabled server, account, telemetry or update check. What leaves your computer is what Claude Code sends: Site Studio returns tool results to Claude Code, and Claude Code sends them to the model it uses.

### MCP server

Claude Code starts one local stdio server, as `.mcp.json` sets out:

```sh
node ${CLAUDE_PLUGIN_ROOT}/mcp-web.js --site ${user_config.site_directory} --data-dir ${user_config.data_directory} --export-dir ${user_config.export_directory}
```

Its environment also gets `SITE_STUDIO_ROOT` and `SITE_STUDIO_DATA` (the site and state folders) and `SystemRoot`, copied from Claude Code's environment and empty when it is not set, as on Linux and macOS; on Windows the server uses it to find PowerShell. The server:

- reads the site folder at every start, without changing it;
- keeps the working copy, history and checkpoints in the state folder (`state.json` and `working-*` folders), plus `lease.json` while it runs. If a first start was killed before `state.json` existed, the next start removes the leftover `working-*` folder and `state.json.*.tmp` file, but only when they hold nothing but a copy of the site, and says so in one line on stderr;
- writes the export folder only when you confirm an export in the dashboard. While it exports, it keeps a lock file and a staging folder next to the export folder; when you export over the original site folder, it keeps the original there as a backup folder;
- answers tool calls over stdio. Tool results can contain your site's text;
- listens on two random ports on 127.0.0.1 only, one for the dashboard and one for the preview, and writes the one-time dashboard link to its stderr, which Claude Code keeps in its MCP log files (see [Review and save](#review-and-save));
- makes no outgoing network requests. The preview blocks external resources unless the server is started with `--allow-external`, which this plugin does not pass;
- checks whether a recorded Site Studio process is still running: from `/proc` on Linux, with `/bin/ps` on macOS, and with `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` on Windows (macOS and Windows are not qualified).

Every tool declares the MCP annotations `title`, `readOnlyHint`, `destructiveHint` and `openWorldHint`, plus `idempotentHint` for the nine tools that change the working copy or its checkpoints: seven tools only read, those nine are marked destructive, and none reaches beyond your computer.

### Mod: the `/site-studio` pane

`hooks/hooks.json` loads one mod module, `hooks/register.tsx`. It hooks five events:

| Event | What the hook does |
| --- | --- |
| `session.start` | Registers the `/site-studio` command, then passes the event on unchanged. It reads nothing and starts nothing. |
| `session.end` | Clears the pane's in-memory state, then passes the event on unchanged. |
| `ui.close`, only for the pane `site-studio-view` | `ui.close` is the event for closing a pane and also the name of the call that closes one; the mod makes that call itself when you press q or select Close. The hook clears the pane's in-memory page, so the result of a read that is still running is ignored, then passes the close on unchanged with `next(e)`. It never refuses, delays or changes a close, and it does not run for other panes. |
| `command.run`, only for `/site-studio` | Checks the view name and arguments you typed, opens the pane and loads its first page. A request it does not accept gets the one-line reply "Use /site-studio help for views and action commands."; otherwise it returns nothing, so pane text never enters the conversation or Claude's context. |
| `ui.render`, only for the Site Studio pane | Draws the pane's rows and buttons. |

The mod's calls are `$.command.register` (adds `/site-studio`), `$.ui.open`, `$.ui.close`, `$.ui.invalidate` and `$.ui.resolve` (open, close, redraw and draw the pane), `$.env.get('PATH')` and `$.process.run`. It makes no network, file, MCP, model or prompt calls.

To load a page (`hooks/register.tsx`, line 23), the mod starts one program with `$.process.run`, which takes a list of arguments and uses no shell:

```sh
/usr/bin/env -i PATH=<Claude Code's PATH> node --max-old-space-size=384 <plugin folder>/tools/site-studio-view.js <view> [<arguments>] [--assets] --site <site folder> --data-dir <state folder> --export-dir <export folder> --json --offset <n> [--snapshot <hash>]
```

The program runs in the plugin folder with a five-second time limit. `hooks/view-contract.mjs` holds the fixed parts of the command; the rest is filled in when you use the pane: the view and arguments you typed after `/site-studio`, your three folder options, the page offset and, when you page, the snapshot hash of the page you were on. Quotes, `$(…)` and `;` in your arguments stay literal text. `env -i` starts the program with an empty environment plus `PATH`, which it needs to find `node`, so none of Claude Code's other variables, such as API keys or tokens, reach it. From your computer, the mod itself reads only that `PATH` value and your three folder options. It starts the program only when you open a view other than `help`, or page or reload such a view (n, p or r): never at session start and never in the background.

The program, `tools/site-studio-view.js`, writes nothing. It reads:

- `state.json` in the state folder: the saved working copy, history and checkpoints;
- `lease.json` in the state folder and, to tell whether that Site Studio server is still running, on Linux `/proc/sys/kernel/random/boot_id`, `/proc/<pid>/stat` for the recorded process, `/proc/self/ns/pid` and the host name (on macOS it runs `/bin/ps -p <pid> -o lstart=` instead);
- for `doctor`, the names of the files in the state folder;
- for `doctor` and `export`, the files in the site folder, to tell whether the site changed since Site Studio opened it, and whether the export folder, its parent folder and an export lock file exist.

It prints one page of at most eight rows as JSON. The mod shows those rows in the pane, and nothing else receives them.

### Commands and skill

The four `/toolsenabled-site-studio:site-studio-*` commands and the `toolsenabled-site-studio` skill are instructions for Claude to use the MCP tools above, with Claude Code's normal permissions. They run nothing themselves.

### Tests that the plugin directory flags

The plugin directory's check reports `test/browser.test.js`, `test/delta.test.js`, `test/lifecycle.test.js` and `hooks/keys.test.ts` as using a credential from your computer. They are tests: the plugin never runs them, and none of them reads a key, token or password. No test contacts the hosts they name. `evil.test` is a forged `Origin` header sent to the local preview server, which must refuse the request; `example.test` is a URL inside HTML and SVG text that the test rewrites in memory; `www.w3.org` appears only in SVG and XHTML namespace names and an SVG DOCTYPE identifier, which nothing downloads. `hooks/keys.test.ts` checks the pane's keyboard keys: every key the pane shows is handled, and no key reaches the prompt. These four files read no environment variables. Their shared helpers (`test/helpers.js`, `test/browser-helper.js` and `test/mcp-helper.js`) read the settings that [docs/TESTING.md](docs/TESTING.md) describes (the browser executable, the sandbox opt-out, the evidence folder and a debug switch), and give the browser, MCP server and Node processes that these tests start only `PATH`, the temporary-folder variables, `SystemRoot` on Windows and, for the browser, `HOME`.

The maintainer scripts in `tools/` are not part of what the plugin runs. Only `tools/generate-release.py` uses the network: a maintainer runs it after a release to look up the release tag with `git ls-remote` and download the release file, to compare it with the local build.

## Review and save

Find `Site Studio dashboard session:` in the host's stderr logs: Claude Code on Linux uses `~/.cache/claude-cli-nodejs/<cwd-slug>/mcp-logs-site-studio/<timestamp>.jsonl` for direct registration; plugin registration uses `mcp-logs-plugin-toolsenabled-site-studio-site-studio/` instead; Desktop uses `mcp-server-<NAME>.log` under `~/Library/Logs/Claude` (macOS) or `%APPDATA%\Claude\logs` (Windows); Codex app-server can expose the line on privately captured stderr with `RUST_LOG=codex_rmcp_client=info` (the documented TUI log route remains unverified here); Cursor uses Output → MCP Logs. DeepSeek Harness inherits its launcher’s stderr; a direct Node launch prints it in that terminal. See [host-specific instructions and recovery](docs/CLAUDE-INSTALL.md#open-the-human-dashboard-before-assigning-work).

**Open the link before giving the agent work. Agent file tools can read an unused secret from these logs if permitted.** Never ask the agent to fetch it. Use **Renew dashboard session** in an authenticated dashboard to revoke old capabilities and keep this tab signed in; if access is lost, stop and restart the MCP connection, then open the newly logged link yourself.

Open the one-time dashboard link from local startup diagnostics. Pause, resume, undo, redo, checkpoint restore/delete and export are **not available as MCP tools** and **require the dashboard session**. Select a page; the preview refreshes as edits land. Pause stops agent mutations. Undo, redo, and checkpoint restore always create a new revision. A paused human can still undo or restore. `web_checkpoint` saves an attributed agent checkpoint. The dashboard also has a human Save checkpoint button. The timeline identifies actor and action type. New events retain the local clock’s UTC timestamp; the history pane marks older or invalid timestamps as “Time not recorded” rather than inventing one. A permanent “Opened working copy (r0)” target remains available after older undo states are pruned. Checkpoint labels cannot use system summaries, the single word “original” (the `changes original` view uses it for the opened working copy) or invisible control characters.

Choose **Export working copy**, inspect the destination/revision, then **Confirm export**. Configuring `--export-dir` selects a destination; it does not authorize an agent export. An agent bridge that reads the one-time dashboard secret from stderr or host logs and uses it to confirm exports is unsupported. An explicit human opt-in, audited agent-export path is a proposed design only, not implemented or supported in 0.1.8. See [export policy choices](docs/EXPORT-GATE.md). An edit arriving while confirmation is open makes that confirmation stale. Export never deploys anything. Export to a new destination leaves the source intact. Export to the original folder retains the previous folder beside it as `.site-studio-backup-<identifier>`. The receipt names the backup. Edits made outside Site Studio to the original cause a drift refusal; start a new state directory to import that new original, after saving any needed working-copy content.

Checkpoints, pause state, undo/redo and the working copy survive restarts. An export also holds a destination lease in its parent directory; if an export process crashes, verify that its recorded PID is gone before removing that `.site-studio-export-*.lock` file. After an abnormal exit, startup recovers a stale `lease.json` automatically and prints a one-line notice. It first requires the same platform, hostname and Linux PID namespace, then compares the PID and operating-system process start identity (including the boot ID on Linux). A live owner still refuses a second writer. Immutable recovery claims coordinate contenders. Malformed leases, unavailable checks, scope mismatches and older leases without scope or creation identity refuse safely. For those cases, manually verify that all writers on the original host and namespace have stopped before removing the named lease; keep the working copy and checkpoints. Do not share state between hosts or namespaces. Do not edit `state.json` or working directories directly.

On macOS, a network change can change the hostname. If the Mac crashed before its lease was released and its hostname then changed, startup refuses the scope mismatch even on the same Mac. Close its Site Studio MCP connections and browser-only instances, and manually verify that no Site Studio writer is still using that state directory, including the recorded PID. Then remove only the named `lease.json` and restart with the same `--data-dir`. Keep `state.json`, working directories and checkpoints; do not edit the recorded hostname to bypass the check.

## Supported sites and limits

- Recursive static folders, nested pages, root-relative URLs and binary assets are supported. HTML/HTM, CSS and UTF-8 text are readable; other files are preserved as opaque bytes for export. HTML paired elements and void elements are addressable. This is not a JavaScript runtime, build system, CMS or server-side template editor. Run your site's build first and select its static output.
- Authored HTML/SVG uses conservative allowlists. Scripts, event attributes, executable embeds, forms, raw source replacement and obfuscated URLs are refused. New SVG supports shapes, groups, gradients, definitions and local references; SVG animation and foreignObject are refused. A drawn SVG file gets the namespace declarations a standalone image needs (`xmlns`, and `xmlns:xlink` when `xlink:href` is used) on its root when they are missing. CSS edits support flat rules; nested rules and at-rules are not edited. Complex browser-repaired HTML can have fewer addressable nodes: use well-formed paired markup.
- Existing source bytes, including scripts and external references, are preserved for export. Preview requires a separate rotating read cookie; copying its URL alone grants no access. CSP and sandboxing disable scripts, frames, forms, automatic meta refresh and base overrides. Preview rewriting removes recognized document/element referrer-policy overrides as defense in depth; it is not a general HTML/XML sanitizer or a guarantee against browser parser recovery. The read capability never appears in the URL. Preview cookies are not port-scoped, so other loopback servers remain outside the protection boundary; see [SECURITY.md](SECURITY.md). Malformed opening tags are dropped from previews. SVG preview requires UTF-8 and supports CDATA and bounded literal internal entities, including common Illustrator namespace declarations. External, recursive and parameter entities are not expanded. Other SVG encodings remain exportable. Local HTML links, srcset entries and ordinary CSS url()/quoted imports are rewritten into its preview path prefix. Escaped CSS resource URLs may not render; original bytes are unchanged for export. It does not simulate your site's JavaScript behavior. External image, font and stylesheet loading is blocked by default; the human may explicitly start with `--allow-external` to permit HTTPS references. Changing that policy requires a new state directory. Exported sites retain the behavior of their original files; review them before serving them elsewhere.
- Only regular, singly linked files are accepted. Symbolic links, hard links, special files, hidden paths other than `.well-known`/`.nojekyll`, traversal, Windows device names and ambiguous cross-platform paths refuse the import. Choose a public static output directory, not a project folder containing credentials or version-control state. Filesystem metadata and executable bits are not preserved; exported files are private until you deliberately change permissions for your hosting setup.
- Preview budgets derive from the 2 MiB input-file limit: 8 MiB transformed output, 2 MiB cumulative decoded XML text, 64 KiB per attribute and at most 2,097,152 tokens. Oversize attributes are omitted individually; the rest of the page remains visible. The dashboard shows attribute omissions and whole-file preview failures. These limits do not change export bytes or impose an OS process-memory ceiling.
- Limits: 2 MiB per file, 32 MiB total, 1,000 files and 1,000 directories; 240-character relative paths, with at most 255 UTF-8 bytes per component. Paths reject invisible formatting/control characters and collisions under NFC normalization and Unicode 15.0 full case folding. The store keeps at most 20 undo states, 20 redo states, 10 named checkpoints and 100 timeline entries. Older undo/redo states are pruned under the 96 MiB history target, but the newest undo and the newest redo state are kept. Only the 128 MiB state ceiling removes those; the edit or dashboard action still succeeds, and its result and the dashboard say so (`undoPruned`). Growth that would exceed 128 MiB even without them is refused. Tool string arguments are limited to 8,192 UTF-16 code units (checkpoint labels to 80). MCP input is limited to 256 KiB per message; an oversize frame is discarded through its newline and subsequent requests continue and output to 64 KiB per result. Reads return at most 16,384 characters; file/node listings and search results paginate or state their limit.
- State directories require a local filesystem that supports hard links for atomic lease publication; unsupported filesystems refuse startup. Linux requires readable `/proc` process identities and PID namespace metadata. Native Windows is not yet supported, and macOS is unqualified. Their untested code paths use `/bin/ps` on macOS and, on Windows, `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` with `SystemRoot` as a fully qualified Windows directory (the full path is launched without searching the current folder or PATH). The Codex plugin explicitly forwards `SystemRoot`; the Claude manifest uses `${SystemRoot:-}` (empty on non-Windows hosts). Missing/invalid values refuse startup before PowerShell is launched. Native Windows, Desktop environment expansion and macOS startup remain unqualified by the Linux test suite. The lease coordinates this product's processes, not arbitrary editors or malicious processes using your OS account. Human-only means no MCP tool grants that authority; a host that separately grants shell/browser access can act outside this tool boundary. The optional [fail-closed guard](docs/MCP.md#optional-host-guard) restricts such tools where the host supports it. A process running as the same user can still act as the user. See [SECURITY.md](SECURITY.md).
- Directory promotion retains a backup when replacing the original. A machine crash during the two directory renames can leave the original at that backup path; keep it and recover manually. This is not a transaction across a remote filesystem or power failure. There is no automatic deployment or remote publication.

## Development and verification

See [testing and package reproduction](docs/TESTING.md) for the complete headless suite, browser prerequisite, stdio lifecycle test and deterministic packaging. See [state compatibility](docs/PROVENANCE.md) and the included [test report](docs/TEST-REPORT.md).

Run the suite with `TMPDIR` set to a short, absolute real path of an existing folder, for example `mkdir -p /tmp/ss && TMPDIR=/tmp/ss SITE_STUDIO_CHROME=/absolute/path/to/chrome node tools/run-tests.js`. The test runner checks `TMPDIR` before it starts any test and stops with a message that names the problem:

- `TMPDIR` must be absolute and must not reach its folder through a symbolic link. The tests keep their sites under `TMPDIR`, and the working-copy store refuses any path that goes through a symbolic link, by design; without this check about a third of the tests would fail with `symbolic link refused`.
- `TMPDIR` may be at most 62 bytes long. Chrome puts its lock socket in a folder under `TMPDIR`, and a Unix socket path holds at most 107 bytes; with a longer `TMPDIR` Chrome exits at once and the fifteen browser tests would fail with a bare `read ECONNRESET`.

## Privacy and support

Site Studio reads the static site folder you select and maintains its private working copy on your computer. It sends selected tool results to your MCP client; that client and its model provider may process the returned site content. Site Studio has no hosted service or telemetry. External preview resources are blocked unless you explicitly opt in. Review your client's data settings before opening confidential sites. [Privacy policy](https://toolsenabled.ai/privacy/). Support: support@toolsenabled.ai.

ToolsEnabled is not affiliated with or endorsed by the listed clients or their vendors. Client configuration generation does not establish native installation or model-workflow qualification.

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
