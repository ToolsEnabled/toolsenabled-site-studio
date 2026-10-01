#!/usr/bin/env node
'use strict';
/** PreToolUse boundary that preserves normal host permission prompts. */
const MAX_HOOK_BYTES = 1024 * 1024;
const ALLOW = new Set(require('./tools-definitions').TOOLS.flatMap(({name})=>['mcp__site-studio__'+name,'mcp__site_studio__'+name]));
const REASONS = {
  Bash: 'WEB_GUARD_SHELL_REFUSED: shell access would bypass pause, revision, and history checks.',
  PowerShell: 'WEB_GUARD_SHELL_REFUSED: shell access would bypass pause, revision, and history checks.',
  Write: 'WEB_GUARD_DIRECT_WRITE_REFUSED: use web_* mutation tools; direct writes are forbidden.',
  Edit: 'WEB_GUARD_DIRECT_EDIT_REFUSED: use web_* mutation tools; direct edits are forbidden.',
  WebFetch: 'WEB_GUARD_NETWORK_REFUSED: network access is not enabled for Site Studio sessions.',
  WebSearch: 'WEB_GUARD_NETWORK_REFUSED: network access is not enabled for Site Studio sessions.',
};
function decide(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.tool_name !== 'string' || !input.tool_name) return ['deny', 'WEB_GUARD_MALFORMED_INPUT: invalid PreToolUse payload; failing closed.'];
  if (ALLOW.has(input.tool_name)) return [null, 'Use the host permission decision.'];
  return ['deny', REASONS[input.tool_name] || `WEB_GUARD_UNKNOWN_TOOL: ${JSON.stringify(input.tool_name)} is not on the allowlist.`];
}
function run() {
  let raw = ''; let bytes = 0; let emitted = false;
  const emit = (decision, reason) => { if (emitted) return; emitted = true; clearTimeout(timer); process.stdin.pause(); if(decision===null){process.exit(0);return;} process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }), () => process.exit(0)); };
  const timer = setTimeout(() => emit('deny', 'WEB_GUARD_INPUT_TIMEOUT: hook input timed out; failing closed.'), 5000); timer.unref();
  process.stdin.on('data', (chunk) => { if (emitted) return; bytes += Buffer.byteLength(chunk); if (bytes > MAX_HOOK_BYTES) emit('deny', `WEB_GUARD_PAYLOAD_TOO_LARGE: payload exceeds ${MAX_HOOK_BYTES} bytes; failing closed.`); else raw += chunk; });
  process.stdin.on('error', () => emit('deny', 'WEB_GUARD_INPUT_ERROR: hook input failed; failing closed.'));
  process.stdin.on('end', () => { if (emitted) return; try { const result = decide(JSON.parse(raw)); emit(result[0], result[1]); } catch (_) { emit('deny', 'WEB_GUARD_PARSE_REFUSED: invalid JSON; failing closed.'); } });
}
module.exports = { ALLOW, REASONS, MAX_HOOK_BYTES, decide, run };
