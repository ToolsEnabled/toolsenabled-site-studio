# Security policy

ToolsEnabled's security policy applies to every ToolsEnabled product; this file states it for ToolsEnabled Site Studio. The full policy lives at https://toolsenabled.ai/security/. The latest release of Site Studio is the supported one; fixes ship as a new release.

## Report a problem

Please report a security problem privately, not in a public issue:

- use **Report a vulnerability** on this repository's **Security** tab (GitHub's private vulnerability reporting, enabled for this repository: https://github.com/ToolsEnabled/toolsenabled-site-studio/security/advisories/new), or
- email **security@toolsenabled.ai**.

Reports from anyone are welcome, including from the directories that list this plugin. Tell us the Site Studio version (the `version` in `manifest.json` and `package.json`, which your agent CLI's plugin list also shows), what you found, and how to reproduce it. We read every report, reply as soon as we can, keep you informed while we fix it, tell you when the fix is released, and credit you in the release notes if you want that.

## What we ask

Good faith means:

- you test on computers, accounts and projects that are yours or that you have permission to use;
- you stop once you can show the problem, and do not use it to go further;
- you do not access, change or keep other people's data beyond what you need to show the problem, and you delete it afterwards;
- you do not disrupt services or other people;
- you give us a reasonable chance to fix the problem before you publish it. We will not ask you to stay silent indefinitely; if we have not fixed it within 90 days of your report, you may publish.

If you are unsure whether something is covered, ask us first at the addresses above.

## Safe harbor

We want people to look for problems in Site Studio, and we will not treat good-faith research as an attack. If you research and report in good faith under this policy:

- we consider your research authorized, and we will not bring or support any legal action against you for it, including under anti-hacking, anti-circumvention or similar laws;
- we waive any part of our own terms that would otherwise stop you from doing that research;
- if someone else takes legal action against you for research that followed this policy, we will make it known that your research was authorized by us.

This safe harbor covers ToolsEnabled's own code and releases. It cannot grant permission for other parties' systems: report a problem in an agent CLI, a model provider or any other software we did not write to its own maker.

## Rewards

ToolsEnabled is a small, self-funded company. We do not pay rewards for reports. We are grateful for every one, and we will credit you publicly if you want that.

Like every ToolsEnabled release, Site Studio is provided "as is", without warranty of any kind, as this repository's [LICENSE](LICENSE) (MIT) says. This policy says how we handle reports, not that any release is free of problems.

## Security boundaries of this release

The rest of this file is the security boundaries document that ships with this release, kept as written: what Site Studio protects, what it does not claim, and the limits it enforces.

# Security boundaries

Pause, resume, undo, redo, checkpoint restore/delete and export are **not available as MCP tools** and **require the dashboard session**. No MCP tool starts capture, publishes or deploys content.

At each launch the process prints a one-time dashboard link with its secret in a URL fragment. The page removes that fragment before exchanging the secret by an Origin-checked JSON POST. The returned per-launch token is held only in sessionStorage, scoped to the exact origin including port. Status, events and controls require it in the X-Site-Studio-Control header. No GET response reveals a session token, and cookies never authorize dashboard status, events or controls. Replayed launch secrets are refused. Keep startup diagnostics private. Host logs can be readable by agent file tools or other local users; an unused secret can be stolen and consumed first. The human should open the link before giving the agent work. See docs/CLAUDE-INSTALL.md for exact host log locations. The authenticated Renew dashboard session action revokes the prior launch secret, dashboard token and preview capability; it is not an MCP tool. If dashboard access is lost, the human stops and restarts the MCP connection to obtain a new link. These recovery procedures do not enforce a physical-human identity against same-user processes.

Every human control also requires the expected loopback Host and exact Origin, JSON content and the current revision. Export needs explicit confirmation and uses the destination configured at startup. Correct Origin and JSON, with or without a stolen loopback cookie, are insufficient. The static preview uses a different loopback origin. An Origin-checked POST to /api/preview-session, authenticated by the dashboard's session header, issues a separate rotating read capability as a host-only HttpOnly, SameSite=Strict session cookie. Its path is restricted to a random preview prefix. The preview URL contains only that routing prefix, never the capability. Missing, wrong or duplicate capability cookies are refused. The controller's /site/ alias is refused. Preview capabilities never appear in MCP results, response bodies or JavaScript-accessible storage; cookies grant only preview reads. Each dashboard load rotates the read capability, routing prefix and cookie name. A refused read at the current prefix signals the authenticated dashboard to re-issue the cookie. Automatic repairs are limited to two per dashboard load; Refresh preview permits a manual retry. Concurrent repair requests converge on the current session.

Preview cookies use HTTP on loopback and are not port-scoped. A browser request to another 127.0.0.1 port with the same cookie path can expose the read cookie to that server. This does not disclose or authorize the dashboard token, which is scoped to the exact origin in sessionStorage and required in a header. Cookie rotation recovers from bounded cookie shadowing, overwrite or eviction, but does not guarantee availability during continuous same-host interference or cookie-header exhaustion. Treat other local processes as outside this protection boundary. The Host check prevents remote use through DNS rebinding.

Preview responses use Referrer-Policy: no-referrer. Rewriting removes recognized document and element referrer overrides, rebuilds all opening tags with escaped attributes, and escapes retained HTML RAW text. This is defense in depth, not a general HTML/XML sanitizer or a guarantee against every browser parser recovery. With --allow-external, permitted resources can still observe ordinary request metadata and any imported content that names them. A Referer cannot disclose the preview read capability because that capability is absent from the URL. Agent-authored fragments are canonicalized and cannot author these overrides. External resource loading requires explicit startup opt-in.

This boundary reduces accidental authority sharing. **A process running as the same user can still act as the user**, including reading process diagnostics or memory, driving the browser or changing files directly. Session capabilities and the optional host hook are not a sandbox against that process. They do not identify whether a physical human clicked a button. Restrict the MCP host's other tools and use OS isolation for stronger separation.

Source and state roots must be separate. File operations reject traversal, symbolic links, hard links, special files and ambiguous paths. A state lease coordinates cooperating Site Studio processes; an export lease serializes cooperating exports to a destination. Startup installs signal handlers before import and yields between bounded file operations and around the initial commit. SIGTERM cancellation releases the acquired lease; an in-progress synchronous file operation finishes before the signal is handled.

Startup automatically recovers a dead state-lease owner only when the recorded platform kind, hostname and Linux PID namespace match the current scope, and its PID plus OS creation identity prove the owner is gone or has been replaced. Linux also compares boot ID; POSIX `ps` creation times use `LC_ALL=C` and `TZ=UTC0`. Immutable nonce-named recovery claims serialize removal; a contender releases only claims it created, and cleanup preserves metadata with live or unverifiable owners. A live owner refuses another writer. Missing scope in older leases, malformed records, scope mismatches or unavailable identity checks refuse recovery; PID absence alone is not proof across scopes. For these refusals, manually verify that all writers on the original host and namespace have stopped before removing the named lease, preserving the state and checkpoints. Hostnames and PID namespaces establish a coordination scope, not an authenticated machine identity. On macOS, a hostname change after a crash can therefore require manual recovery on the same Mac. Stop all Site Studio writers using that state directory, verify the recorded owner is no longer writing, and remove only the named `lease.json` before restarting; preserve state and checkpoints. Do not rewrite the lease hostname to bypass refusal. Never share a state directory between hosts or namespaces. These checks coordinate cooperative local processes and do not protect against same-user tampering.

A process with permission to concurrently replace path ancestors remains outside the filesystem trust boundary. Network filesystems and arbitrary direct writers are unsupported. State lease publication requires hard-link support on a local filesystem. On native Windows, which is not yet supported, startup invokes the full `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` path to query UTC process start ticks, with a five-second deadline. `SystemRoot` must be present in the server environment and be a fully qualified Windows directory; the current folder and PATH are not searched. Missing or failed queries refuse startup. Linux needs readable `/proc` identities and namespace metadata; macOS needs `/bin/ps`. Native Windows and macOS execution remain unqualified by the Linux tests.

New HTML/SVG/CSS is checked by conservative allowlists and reference rules. Imported scripts and source bytes are preserved for export but run inert in preview. Preview CSP and iframe sandbox disable scripting, frames and forms. Preview rewriting removes recognized HTTP-equivalent meta tags, referrer meta tags and base overrides, and drops malformed opening tags. Parser differences can expose markup outside those recognized tokens; CSP base-uri and the sandbox remain the enforcement against base overrides and automatic refresh. SVG preview requires UTF-8 and uses XML tokenization without HTML RAW rules. CDATA is retained; DOCTYPE declarations are removed after resolving at most 128 simple literal internal entities of at most 4,096 UTF-8 bytes each, under a cumulative 2 MiB decoded-text budget. Custom XML entities are not expanded in URL-bearing attributes or CSS. Preview transformations enforce an 8 MiB UTF-8 output limit, 64 KiB per attribute value and a token allowance derived from the 2 MiB input-file limit, checking budgets before retaining transformed output. An oversize attribute is omitted individually, with a dashboard notice; whole-file transform failures also appear there. External, parameter and recursive entities are not resolved; unresolved references render as literal text. Other encodings remain preserved for export but cannot be previewed. HTTPS external static resources require explicit startup opt-in. Model output is never executed as a command. Runtime includes no provider client, credentials, network fetcher or deployment code.

Both listeners use two-second incomplete-request and socket-idle timeouts, a one-second keep-alive timeout and no global connection-count cap. The authenticated event stream is exempt from socket-idle timeout and limited to eight clients. Refused requests close their connection. These controls avoid the previous pre-authentication slot lockout; they do not guarantee availability against OS resource exhaustion.

CSS reads and rule mutation share a linear scan. HTML indexing uses per-tag stacks and re-indexes only the edited file. CSS edits refuse control, formatting and Unicode separator characters other than ordinary space. Every runtime regex is inventoried and tested on adversarial inputs under a child-process time budget; see [the regex audit](docs/REGEX-AUDIT.md). Those budgets are test gates, not runtime preemption. Preview transformations are cached per frozen snapshot file under a 64 MiB buffer budget; a commit invalidates the cache. Failed transformations are cached per snapshot across query variants and preview-session rotations. These bounds and memory regression checks limit preview amplification; they are not a process-wide memory ceiling.

State writes use a flushed temporary file and atomic rename; the directory is flushed where supported. A post-rename directory-sync failure reports a durability warning without pretending the edit was rejected. Export stages a complete tree and retains the original as a backup when replacing it. Ordinary promotion/persistence failures roll back; a process or machine crash between directory renames may require restoring the retained backup manually. Keep independent backups for valuable sites.

Read the included [test report](docs/TEST-REPORT.md) and [reproduction commands](docs/TESTING.md). The included evidence covers synthetic protocol clients and headless Chromium on Linux with Chrome sandboxing disabled in this container. Referrer tests inspect browser-prepared HTTPS request headers through DevTools interception, including redirects and SVG; a real TLS receiver could not run here because the installed Chromium dependencies lack the NSS soft-token library. It does not substitute for an independent security review or real-host qualification.

Local views read only the explicitly configured saved state and verify its site binding. They refuse symlink paths, hard-linked/nonregular or over-128-MiB state files, and never acquire leases, initialize state or read session logs/capabilities. The pane launches a child with a five-second deadline and a 384-MiB JavaScript heap ceiling; this is not an OS memory limit. Claude Code adds `process.run` variables to its own environment instead of replacing it, so the pane starts the reader through `/usr/bin/env -i` with only `PATH`; API keys, messaging tokens and other client variables are not inherited. This launch needs a POSIX `env`; native Windows is not supported. Output is bounded, terminal controls are replaced, and a hash of the complete saved snapshot pins paging, including same-revision checkpoint/pause changes. Concurrent hostile replacement of path ancestors remains outside the same-user filesystem boundary. The CLI uses the same reader; its text can enter a host's later model context. Native action commands submit scoped editing workflows with ordinary host permissions; they do not add human-control authority.

Codex forwards `SystemRoot` explicitly and the Claude manifest uses `${SystemRoot:-}` (empty when absent on Linux/macOS). Windows refuses missing/invalid values before launching PowerShell. Desktop interpolation and native Windows execution remain unqualified.
