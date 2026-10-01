# Site Studio design

## Runtime and state

Node.js 22+ serves a stdio MCP interface, a human dashboard, and a separate static preview. Runtime modules live in src/, browser assets in public/, and tests in test/. The root entry points are mcp-web.js, web-server.js and web-guard.js. There are no runtime dependencies, provider clients, subprocess launchers or deployment adapters. The MCP host supplies the agent.

The human selects the source, private state directory and export destination at startup. Import accepts bounded regular files, preserves binary bytes, and rejects links, special files, unsafe paths and Unicode aliases. One process owns the state lease. Entry points install signal handlers before asynchronous startup import, which yields between bounded files and around the initial commit so cancellation can release that lease. Revisions increase through edits, undo, redo and restore. A permanent opened-copy snapshot coexists with bounded undo/redo, named checkpoints and attributed history. Agent checkpoint labels remain separate from system summaries.

Each edit materializes a fresh private working tree and atomically replaces the flushed state document. The committed model also supplies an immutable HTTP snapshot. Original files change only through a confirmed dashboard export. Export compares locale-independent source fingerprints, takes a destination lease, stages a full tree and retains a backup when replacing the original. Ordinary failures roll back; crash recovery can require the retained backup.

## Editing and reads

Closed schemas and expected_rev bind mutations to the caller's last read. A quote-aware tokenizer identifies HTML nodes. Text is escaped; HTML, SVG, attributes and CSS use conservative allowlists. Flat CSS reads and mutations share a linear scanner, including malformed brace-free and separator tails. HTML indexing uses per-tag stacks and re-indexes only the changed file. Attribute parsing advances one cursor. Unicode full case folding runs once per searched file and maps matches back to original UTF-16 offsets. Runtime regexes live in one audited inventory with per-pattern adversarial time-budget tests. Input and output limits bound protocol frames, strings and read results. Oversize input is refused per frame while later frames continue.

Sixteen tools expose reading, editing, checkpoints and preview discovery. Pause, resume, undo, redo, restore, checkpoint deletion and export are not available as MCP tools and require the dashboard session. The optional host guard denies unknown tools and leaves recognized tools to the host's usual permission prompts.

## Dashboard and preview

A startup link holds a one-time fragment secret. The dashboard removes it from the address bar and exchanges it through an Origin-checked JSON POST. The per-launch token stays in sessionStorage and is required as a header on status, event-stream and control requests. No GET serves a token, and cookies grant no authority. Control requests also require a matching Host, Origin, revision and explicit export confirmation where applicable.

The separate preview origin requires a per-launch read capability in its path. The authenticated dashboard obtains that path; MCP results contain only origins. Local references are rewritten for preview without altering stored or exported bytes. CSP and sandboxing keep imported scripts inert. Preview removes base and HTTP-equivalent meta tags, document referrer meta tags and element referrerpolicy attributes; unparseable opening tags are dropped and their raw contents are escaped. Preview drops comments and processing instructions, canonicalizes end tags, recognizes browser RAW-closing boundaries, and does not treat SVG/MathML contents as HTML RAW text. Links receive rel=noreferrer. HTML and UTF-8 SVG receive this treatment, while exports retain their original bytes. Referrer-Policy is no-referrer. A bounded 64 MiB cache reuses transformed bytes by snapshot file across query variants and is invalidated on commit. External HTTPS static resources require --allow-external. HTTP connections and incomplete headers have two-second idle/request lifetimes, keep-alive is one second, and there is no global connection-count cap. Header-authenticated event streams are exempt from idle timeout and limited to eight.

Capabilities separate plugin tool authority from dashboard controls. They do not isolate hostile processes running as the same OS user. Such a process can still act as the user; see SECURITY.md.

## Verification

The maintained suite covers golden tool schemas, all operations, validation, storage failures, source confinement, export, process lifecycle and real Chromium dashboard behavior. Synthetic stdio tests exercise a two-page edit/export/restart lifecycle. The explicit package manifest includes the runtime, sample, docs and tests. Fixed member timestamps and modes produce deterministic ZIPs. See TESTING.md for commands and TEST-REPORT.md for measured results and limits.
