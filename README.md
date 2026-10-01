# ToolsEnabled Site Studio 0.1.0

Edit a static website through any MCP host. Site Studio makes a private working copy, provides a live browser preview, and keeps revision history and named checkpoints. The human controls pause, undo, restore, and export. Your original folder stays unchanged until you explicitly confirm an export to it.

Node.js **22 or newer** is the only runtime prerequisite. There is no npm install step, hosted service, account, model provider, or publishing integration.

## Start

From the extracted plugin directory:

```sh
node mcp-web.js --site /absolute/path/to/static-site --data-dir /absolute/path/to/private-state --export-dir /absolute/path/to/finished-site
```

The export parent must already exist. The destination must be a new folder, or the original site folder itself. The state folder must be new or empty, outside the original/export folders, and dedicated to Site Studio. Existing state folders require private permissions (`chmod 700` on Linux/macOS). On Windows, use a directory accessible only to your account.

This command starts the **stdio MCP server** and two loopback listeners: a human dashboard and a separate site preview. A one-time dashboard session link is written to local stderr diagnostics. Open that private link once; the page removes the fragment secret from the address bar, exchanges it once by POST, and keeps the session token in sessionStorage for that browser tab and exact origin. Requests carry a required session header; no cookie is created. `web_preview` returns only the clean URL and the preview origin, never a session or preview capability. Open the private dashboard link to view the site. MCP JSON stays on stdout. Without `--site`, the included two-page Fieldwork sample opens in a private copy. Without `--data-dir`, state lives in `~/.site-studio/<site-identifier>`. `SITE_STUDIO_ROOT` and `SITE_STUDIO_DATA` are environment alternatives. Without `--export-dir`, export stays disabled.

For browser-only operation, replace `mcp-web.js` with `web-server.js`. One process owns each state directory: do not launch browser-only mode alongside MCP on the same state directory. Close the MCP host or send EOF/SIGINT/SIGTERM/SIGHUP (or SIGBREAK on Windows) to stop; both listeners and the lease are released. Startup import also responds to shutdown between bounded file operations.

## Connect a client

Print the appropriate registration command or configuration:

```sh
node tools/mcp-config.mjs --client claude --site /absolute/path/to/static-site --data-dir /absolute/path/to/private-state --export-dir /absolute/path/to/finished-site
```

Replace `claude` with `codex`, `cursor`, `claude-desktop`, or `deepseek`. Claude Code and Codex receive shell commands; Cursor and Claude Desktop receive `mcpServers` JSON; DeepSeek Harness receives a Cordis plugin row in YAML for placement under `- insert:` in a profile overlay. Run the printed command or merge the configuration into your client. The helper never changes settings. On Windows, printed commands use PowerShell quoting. Use a different state directory for simultaneously running clients.

The archive also contains `.codex-plugin/plugin.json` and `.mcp.json` for plugin-aware hosts. The latter uses the host's `${CLAUDE_PLUGIN_ROOT}` substitution and opens the sample by default. For a selected site, use the helper or configure `SITE_STUDIO_ROOT`/`SITE_STUDIO_DATA` in the host. No marketplace or account setup is required by this package.

Try asking your MCP host: “Read the site, update its headline, add a section, and show me the preview.” See [all tools and examples](docs/MCP.md).

## Review and save

Open the one-time dashboard link from local startup diagnostics. Pause, resume, undo, redo, checkpoint restore/delete and export are **not available as MCP tools** and **require the dashboard session**. Select a page; the preview refreshes as edits land. Pause stops agent mutations. Undo, redo, and checkpoint restore always create a new revision. A paused human can still undo or restore. `web_checkpoint` saves an attributed agent checkpoint. The dashboard also has a human Save checkpoint button. The timeline identifies actor and action type. A permanent “Opened working copy (r0)” target remains available after older undo states are pruned. Checkpoint labels cannot use system summaries or invisible control characters.

Choose **Export working copy**, inspect the destination/revision, then **Confirm export**. An edit arriving while confirmation is open makes that confirmation stale. Export never deploys anything. Export to a new destination leaves the source intact. Export to the original folder retains the previous folder beside it as `.site-studio-backup-<identifier>`. The receipt names the backup. Edits made outside Site Studio to the original cause a drift refusal; start a new state directory to import that new original, after saving any needed working-copy content.

Checkpoints, pause state, undo/redo and the working copy survive restarts. An export also holds a destination lease in its parent directory; if an export process crashes, verify that its recorded PID is gone before removing that `.site-studio-export-*.lock` file. After an abnormal exit, the next startup refuses an existing `lease.json`. Stop every Site Studio process using that state directory, inspect its recorded PID and verify the holder is gone, then remove **only** that stale lease. Never remove a live process's lease. Do not edit `state.json` or working directories directly.

## Supported sites and limits

- Recursive static folders, nested pages, root-relative URLs and binary assets are supported. HTML/HTM, CSS and UTF-8 text are readable; other files are preserved as opaque bytes for export. HTML paired elements and void elements are addressable. This is not a JavaScript runtime, build system, CMS or server-side template editor. Run your site's build first and select its static output.
- Authored HTML/SVG uses conservative allowlists. Scripts, event attributes, executable embeds, forms, raw source replacement and obfuscated URLs are refused. New SVG supports shapes, groups, gradients, definitions and local references; SVG animation and foreignObject are refused. CSS edits support flat rules; nested rules and at-rules are not edited. Complex browser-repaired HTML can have fewer addressable nodes: use well-formed paired markup.
- Existing source bytes, including scripts and external references, are preserved for export. Preview requires a separate per-launch read capability. It disables scripts, frames, forms, automatic meta refresh and base overrides, and strips document/element referrer-policy overrides. Malformed opening tags are dropped from previews. SVG preview requires UTF-8; other SVG encodings remain exportable. Local HTML links, srcset entries and ordinary CSS url()/quoted imports are rewritten into its private path prefix. Escaped CSS resource URLs may not render; original bytes are unchanged for export. It does not simulate your site's JavaScript behavior. External image, font and stylesheet loading is blocked by default; the human may explicitly start with `--allow-external` to permit HTTPS references. Changing that policy requires a new state directory. Exported sites retain the behavior of their original files; review them before serving them elsewhere.
- Only regular, singly linked files are accepted. Symbolic links, hard links, special files, hidden paths other than `.well-known`/`.nojekyll`, traversal, Windows device names and ambiguous cross-platform paths refuse the import. Choose a public static output directory, not a project folder containing credentials or version-control state. Filesystem metadata and executable bits are not preserved; exported files are private until you deliberately change permissions for your hosting setup.
- Limits: 2 MiB per file, 32 MiB total, 1,000 files and 1,000 directories; 240-character relative paths, with at most 255 UTF-8 bytes per component. Paths reject invisible formatting/control characters and collisions under NFC normalization and Unicode 15.0 full case folding. The store keeps at most 20 undo states, 20 redo states, 10 named checkpoints and 100 timeline entries. Older undo/redo states are pruned under the 96 MiB history target; a 128 MiB state ceiling refuses further growth. Tool string arguments are limited to 8,192 UTF-16 code units (checkpoint labels to 80). MCP input is limited to 256 KiB per message; an oversize frame is discarded through its newline and subsequent requests continue and output to 64 KiB per result. Reads return at most 16,384 characters; file/node listings and search results paginate or state their limit.
- Local filesystems are required. The lease coordinates this product's processes, not arbitrary editors or malicious processes using your OS account. Human-only means no MCP tool grants that authority; a host that separately grants shell/browser access can act outside this tool boundary. The optional [fail-closed guard](docs/MCP.md#optional-host-guard) restricts such tools where the host supports it. A process running as the same user can still act as the user. See [SECURITY.md](SECURITY.md).
- Directory promotion retains a backup when replacing the original. A machine crash during the two directory renames can leave the original at that backup path; keep it and recover manually. This is not a transaction across a remote filesystem or power failure. There is no automatic deployment or remote publication.

## Development and verification

See [testing and package reproduction](docs/TESTING.md) for the complete headless suite, browser prerequisite, stdio lifecycle test and deterministic packaging. See [state compatibility](docs/PROVENANCE.md) and the included [test report](docs/TEST-REPORT.md).
