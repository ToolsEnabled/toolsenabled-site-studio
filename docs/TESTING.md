# Verification and reproducible packaging

Runtime: Node.js 22+. Packaging uses Python 3's standard library. Browser tests require a Chrome or Chromium executable; the product itself does not.

## Full headless suite

Set `SITE_STUDIO_CHROME` to your browser executable and run:

```sh
SITE_STUDIO_CHROME=/absolute/path/to/chrome env -u DISPLAY node tools/run-tests.js
```

On Windows PowerShell:

```powershell
$env:SITE_STUDIO_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Remove-Item Env:DISPLAY -ErrorAction SilentlyContinue
node tools/run-tests.js
```

The runner removes DISPLAY and executes every `test/*.test.js` serially with a per-file timeout. Browser tests use the DevTools pipe, an isolated temporary profile, disabled background services, and no external pages. In an already isolated container where Chrome's sandbox is unavailable, explicitly set `SITE_STUDIO_CHROME_NO_SANDBOX=1`. The Linux container used for the [recorded results](TEST-REPORT.md) required this setting, which adds --no-sandbox and --no-zygote. Without it, the harness leaves both sandboxing and the zygote enabled. Browser teardown is bounded and precedes closing any test receiver server. Missing browser prerequisites fail with an actionable message.

Linux FIFO tests have no direct Windows equivalent. SIGHUP lifecycle tests run on POSIX; Windows SIGBREAK wiring has been inspected but has not been executed on Windows. The PowerShell command above is provided for reproduction; Linux results do not establish Windows compatibility.

The suite checks tool names, descriptions and schemas; input validation and refusals; eleven working-copy edit operations; HTML/CSS/SVG attack cases; source and state confinement; binary assets; checksums, revisions, pause, checkpoints, undo/redo/restore; export drift and backups; atomic save failure; process contention and shutdown; client configuration; and browser controls, rendering and accessibility.

Security and performance tests cover bounded CSS scanning, session exchange and cross-port isolation, preview capabilities, timeline attribution, Unicode paths, fingerprint migration, transport recovery and shutdown. Inputs include 2 MiB separator runs and malformed HTML, SIGTERM during import, 48 held sockets per origin, preview-cache invalidation, malformed URL/meta handling and original-source Unicode search offsets. Each of the 52 runtime regexes runs on 22 adversarial shapes under a separate three-second process budget. A source check rejects runtime regexes outside src/patterns.js. See [REGEX-AUDIT.md](REGEX-AUDIT.md).

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
