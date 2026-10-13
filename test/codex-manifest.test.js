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
  assert.equal(codex.interface.developerName, 'ToolsEnabled, Inc.');
  assert.deepEqual([codex.interface.websiteURL, codex.interface.supportURL, codex.interface.privacyPolicyURL, codex.interface.termsOfServiceURL], ['https://toolsenabled.ai/site-studio/', 'https://toolsenabled.ai/support/', 'https://toolsenabled.ai/privacy/', undefined]);
});
