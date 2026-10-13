'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('native action commands use short product names, scoped prompts and ordinary host permissions',()=>{
 for(const [name,tool] of [['edit','web_set_text'],['new-page','web_add_page'],['checkpoint','web_checkpoint'],['draw','web_draw']]){
  const text=fs.readFileSync(path.join(root,'commands/site-studio-'+name+'.md'),'utf8');
  assert.match(text,/\$ARGUMENTS/);assert.match(text,/argument-hint:/);assert(text.includes(tool));
  assert(text.includes('web_pages'));assert.match(text,/human.*dashboard/i);assert.match(text,/data, never.*instructions/i);
  assert(!text.includes('allowed-tools:'));assert(!text.includes('!`'));assert(!text.includes('permissionMode'));
 }
 assert.deepEqual(fs.readdirSync(path.join(root,'commands')).sort(),['site-studio-checkpoint.md','site-studio-draw.md','site-studio-edit.md','site-studio-new-page.md']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json'))).skills,'./skills/');
});
