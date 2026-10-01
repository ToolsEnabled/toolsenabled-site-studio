# Runtime regular-expression audit

Every runtime regex is declared in src/patterns.js. The inventory test scans root entries, src/, public/ and JavaScript tooling, including template substitutions. A slash expression or dynamic RegExp/eval/Function outside the inventory fails that check. Structural HTML and CSS parsing uses advancing cursors; no selector or attribute name is interpolated into a regex.

The 50 inventory entries each run in a separate child process with a three-second budget. Every entry sees 22 adversarial shapes of up to roughly 2 MiB: missing terminators, long identifiers, CSS separators, whitespace tails, quote and backslash runs, repeated URL prefixes, numeric entities, and malformed closing tags. Global patterns are exhausted rather than checked only at their first match. Tests use the actual runtime objects, not copies of their expressions. Timings are a regression gate, not a mathematical proof for every JavaScript engine or input.

## Pattern families and bounded work

- Character classes: whitespace/name characters, forbidden path/reference/CSS characters, quote/text escaping and non-word replacement. Each match examines a character or advances over a disjoint run.
- Anchored names: path tails/device names, attribute names, CSS selectors/properties, fragment references, system labels, generated directory names and filesystem error codes. Alternatives have fixed prefixes or disjoint starts; repetition has no overlapping repeated group. Product limits additionally bound paths, labels and tool strings.
- Reference prefixes and suffixes: HTTPS/scheme prefixes, encoded separators, file extensions and fixed forbidden CSS terms. There is no multiline anchor followed by a whitespace scan.
- Structured leaf values: HTML entities, CSS url() values and SVG paint references. Delimiters prevent one candidate from consuming the next candidate's prefix. CSS validation rejects control/separator characters before parsing declarations.
- Full-fold exceptions: a fixed BMP character class plus one disjoint surrogate-pair range. Ordinary runs use native lowercase; exceptional Unicode folds are handled explicitly. No-hit searches allocate no offset map, and hit boundaries are mapped by a forward cursor.
- Fixed raw-element closers: nine constant tag-name patterns followed by a whitespace, slash or closing-bracket boundary. An advancing cursor consumes the remainder of each closing tag. Names are never supplied by content. Each regex starts at the tokenizer's current position, and matched raw content is consumed once.

HTML tag and attribute structure is scanned without regex backtracking. The attribute cursor does not trim the remaining input on every attribute. CSS declaration parsing splits at its first colon and validates the property separately. CSS rule replacement/removal shares the linear top-level rule scanner with reads. HTML indexing maintains a per-tag stack and emits nodes in opening order; each opening is pushed and popped at most once. Import yields between bounded file operations so startup signals can release its lease.
