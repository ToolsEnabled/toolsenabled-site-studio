'use strict';
// The Codex listing manifest (.codex-plugin/plugin.json). Kept apart from the tests that start processes, so this
// file only reads JSON.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

test('Codex manifest turns off the Claude hooks file and carries the listing links and publisher', () => {
  const codex = read('.codex-plugin/plugin.json');
  // Codex reads hooks/hooks.json (the Claude Code /site-studio mod) unless its manifest declares hooks; the empty object turns that off.
  assert.deepEqual(codex.hooks, {});
  const launch=codex.mcpServers['site-studio'];
  assert(launch.env_vars.includes('SITE_STUDIO_WINDOWS_CANDIDATE'),'the Windows candidate choice must reach the guarded server');
  assert.equal(launch.env?.SITE_STUDIO_WINDOWS_CANDIDATE,undefined,'a plugin install must not enable the candidate itself');
  assert.equal(codex.interface.developerName, 'ToolsEnabled, Inc.');
  // Same words as the Claude Code listing: Site Studio edits built sites; it is not a build system.
  assert.equal(codex.description, read('.claude-plugin/plugin.json').description);
  assert.deepEqual([codex.interface.websiteURL, codex.interface.supportURL, codex.interface.privacyPolicyURL, codex.interface.termsOfServiceURL], ['https://toolsenabled.ai/site-studio/', 'https://toolsenabled.ai/support/', 'https://toolsenabled.ai/privacy/', undefined]);
});
