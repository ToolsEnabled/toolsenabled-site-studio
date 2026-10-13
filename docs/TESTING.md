# Verification and reproducible packaging

Linux tested; native Windows not yet supported. Runtime: Node.js 22+. Packaging uses Python 3's standard library. Browser tests require a Chrome or Chromium executable; the product itself does not.

## Full headless suite

Set `SITE_STUDIO_CHROME` to your browser executable and run:

```sh
SITE_STUDIO_CHROME=/absolute/path/to/chrome env -u DISPLAY node tools/run-tests.js
```

Native Windows is not yet supported. The PowerShell form below is kept for future Windows qualification only and has not been run for this release:

```powershell
$env:SITE_STUDIO_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Remove-Item Env:DISPLAY -ErrorAction SilentlyContinue
node tools/run-tests.js
```

The runner removes DISPLAY and executes every `test/*.test.js` serially with a 120-second per-file timeout. Browser commands and condition waits have a 15-second budget; explicit performance-test budgets remain unchanged. Navigation waits for the new document’s load event and all asynchronous Fetch interception handlers; unrelated favicon requests cannot overwrite the cookie fixture capture. Browser tests use the DevTools pipe, an isolated temporary profile, disabled background services, and no external pages. The browser and the MCP servers that the shared test helpers start get only `PATH`, the temporary-folder variables, `SystemRoot` on Windows and, for the browser, `HOME` from the runner's environment. In an already isolated container where Chrome's sandbox is unavailable, explicitly set `SITE_STUDIO_CHROME_NO_SANDBOX=1`. An earlier Linux container used for [recorded results](TEST-REPORT.md) required this setting, which adds --no-sandbox and --no-zygote; the 0.1.4 and 0.1.5 runs on a Linux host did not. Without it, the harness leaves both sandboxing and the zygote enabled. Browser teardown is bounded and precedes closing any test receiver server. Missing browser prerequisites fail with an actionable message.

Linux FIFO tests have no direct Windows equivalent. SIGHUP lifecycle tests run on POSIX; Windows SIGBREAK wiring has been inspected but has not been executed on Windows. Linux results do not establish Windows compatibility.

The suite additionally checks release-sidecar generation against synthetic pushed-tag/download fixtures and packet copying against compressed/private-key and unlisted-file cases. Those Python helpers require Git on PATH.

The suite checks tool names, descriptions and schemas; input validation and refusals; eleven working-copy edit operations; HTML/CSS/SVG attack cases; source and state confinement; binary assets; checksums, revisions, pause, checkpoints, undo/redo/restore; export drift and backups; atomic save failure; process contention and shutdown; client configuration; and browser controls, rendering and accessibility.

Security and performance tests cover bounded CSS scanning, session exchange and cross-port isolation, preview capabilities, timeline attribution, Unicode paths, fingerprint migration, transport recovery and shutdown. Inputs include 2 MiB separator runs and malformed HTML, SIGTERM during import, 48 held sockets per origin, preview-cache invalidation, malformed URL/meta handling and original-source Unicode search offsets. Each of the 53 runtime regexes runs on 22 adversarial shapes under a separate three-second process budget. A source check rejects runtime regexes outside src/patterns.js. See [REGEX-AUDIT.md](REGEX-AUDIT.md).

Additional fixtures include rejected 8,191-character folded queries, newer Unicode runs, bounded XML/preview memory amplification, cached failures, semicolonless attribute references and bounded recovery from another loopback port overwriting, shadowing or evicting preview cookies. Time and memory gates run in isolated child processes. Wall-clock performance gates require a quiet host: competing CPU-heavy jobs can cause timeouts without a code regression. Retain such failures, stop competing test workloads and rerun the unchanged gate; do not relax its budget. See the test report for limits.

Additional fixtures cover CSS comment/at-rule prefixes and escaped delimiters, invalid CSS quotes/brackets, overlapping Unicode fold matches and surrogate boundaries, and 15-file no-hit searches over em-dash and CJK content under a 2.5-second child-process budget. A separate four-second budget covers five 2 MiB files for each of sharp-s, Greek sigma and Cherokee. Browser cases include 19 parser/referrer shapes plus eleven foreign-content and XML root variants, preview-cookie issuance and cross-port behavior, legacy HTML rendering mode, named entities, and SVG CDATA with Illustrator-style namespace declarations.

The HTTPS referrer tests use real Chromium and DevTools Fetch interception to examine prepared request headers before network/TLS setup, including redirects and SVG. Requests are fulfilled locally. This does not test a real HTTPS receiver: that attempt failed in the recorded environment because Chromium's NSS soft-token library was missing.

## Real stdio lifecycle, without models

```sh
env -u DISPLAY node --test --test-timeout=30000 test/lifecycle.test.js
```

The lifecycle starts a real MCP process on a temporary two-page site, drives text, attribute, CSS, section and SVG edits, creates a checkpoint, performs dashboard-authorized undo/restore and confirmed export, then compares HTML/CSS/SVG/binary bytes. It verifies unchanged originals, successful EOF exit, released ports/lease, and restoration of the saved revision after restart. Companion tests cover invalid/stale requests, concurrent edits and competing processes. These use synthetic protocol clients rather than model-driven demonstrations.

Set `SITE_STUDIO_EVIDENCE_DIR` to a new directory to save browser screenshots and lifecycle source, export and receipt files. These files do not include the dashboard control token. `TEST_TRACE=1` prints RPC sequence IDs for local debugging. Save the test runner's output to retain its TAP results.

## Deterministic archive

```sh
python3 tools/package.py --output /absolute/path/to/site-studio-a.zip
python3 tools/package.py --output /absolute/path/to/site-studio-b.zip
```

Compare their SHA256 hashes. The packager uses an explicit file manifest, rejects links and missing files, fixes member timestamps/modes and stores uncompressed bytes for reproducibility independent of zlib versions. The archive extracts to `site-studio/`; it includes runtime, docs, sample, tests and build manifest. State, dependencies, Git data, personal files, provider adapters and test output are excluded. Unzip in a new directory and run the full suite there. No registry, package download, model call or build service is needed.

## Local command views and Claude hook tests

`node --test test/views.test.js test/commands.test.js` checks live/stopped saved-state reads, unchanged state/lease bytes, snapshot paging across same-revision changes, missing/wrong configuration, linked/oversized files, terminal controls and native action prompt boundaries. The shared terminal sanitizer is checked against every Unicode control/format/default-ignorable character recognized by the installed Node runtime.

With a separately installed Claude Code 2.1.287 binary, run `claude plugin validate /absolute/site-studio` and `claude plugin test /absolute/site-studio` using a scratch `CLAUDE_CONFIG_DIR`. The tests do not require credentials or model turns. They exercise the actual client's hook facade: no reads at startup, own-runtime argv and limits, no MCP/model calls, snapshot paging, failed/truncated replies, close-during-read and exact action help. The facade does not start real children, so `test/pane-env.test.js` starts the pane's exact reader launch as a real child and checks that only `PATH` reaches it. This does not test native terminal paint or OS permissions. Interactive qualification must separately check every pane, paging, Esc/q, composer focus, absence of permission prompts/model work on views, and one explicitly requested action with the normal permissions.

The ordinary Node suite does not silently substitute for those Claude-specific tests. Codex's local CLI is not a plugin-defined Codex pane; use the documented bang command and preserve that distinction in test reports.

Expanded reader fixtures also cover page outlines/source/CSS, Unicode find, file changes and bounded line replacements, local reference checks, missing/older state, explicit policy mismatch, server defaults, read-only process identity inspection and export readiness. The static check reports incomplete parsing/limits and does not run JavaScript, resolve fragment IDs, fetch URLs or fully model the browser's HTML/CSS parser. Native hook tests cover quoted argument dispatch and paged help; row labels are shortened to fit and row detail retains bounded text.
