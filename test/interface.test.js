'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {fixture, textOp} = require('./helpers');
const {createCoordinator} = require('../web-server');
const {call} = require('../mcp-web');
const data = result => {assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};

test('all read tools, text and node pagination, and narrow result limits', async t => {
  const o = fixture(t);
  fs.writeFileSync(path.join(o.sourceRoot,'long.txt'),'x'.repeat(40000));
  fs.writeFileSync(path.join(o.sourceRoot,'many.html'),'<main>'+Array.from({length:60},(_,i)=>'<p>Line '+i+'</p>').join('')+'</main>');
  const app = createCoordinator(o); t.after(()=>app.close());
  const pages = data(call(app,'web_pages',{limit:2}));
  assert.equal(pages.files.length,2); assert.equal(pages.nextOffset,2);
  const file = app.model.files.find(f=>f.path==='many.html');
  const nodes = data(call(app,'web_pages',{file_id:file.id,node_offset:20}));
  assert.equal(nodes.files[0].nodes.length,20); assert.equal(nodes.files[0].nextNodeOffset,40);
  const long = app.model.files.find(f=>f.path==='long.txt');
  const read = data(call(app,'web_read',{file_id:long.id}));
  assert.equal(read.source.length,16384); assert.equal(read.nextOffset,16384);
  assert.equal(data(call(app,'web_read',{file_id:long.id,start:16384})).start,16384);
  assert.equal(data(call(app,'web_find',{query:'Line',limit:3})).hits.length,3);
  assert.match(data(call(app,'web_css',{selector:'h1'})).rules[0].declarations,/navy/);
  assert.equal(data(call(app,'web_screenshot_note')).notice,'No pixels were captured.');
  app.edit(textOp(app.model)); assert.equal(data(call(app,'web_timeline')).rev,1);
  for (const [name,args] of [['web_css',{file_id:'missing',selector:'x'}],['web_pages',{file_id:'missing'}],['web_read',{file_id:long.id,start:10,end:2}],['web_find',{query:''}]]) assert(call(app,name,args).isError);
});

test('guard denies all direct writes, shell, network, model tools and malformed input', () => {
  const {TOOLS} = require('../src/tools-definitions'); const {decide} = require('../web-guard');
  for (const {name} of TOOLS) assert.equal(decide({tool_name:'mcp__site-studio__'+name})[0],null);
  for (const {name} of TOOLS) assert.equal(decide({tool_name:'mcp__plugin_toolsenabled-site-studio_site-studio__'+name})[0],null);
  for(const name of ['mcp__plugin_toolsenabled-site-studio_site-studio__web_export','mcp__plugin_other_site-studio__web_read','mcp__plugin_toolsenabled-site-studio_other__web_read'])assert.equal(decide({tool_name:name})[0],'deny');
  for (const name of ['Read','Write','Edit','Bash','PowerShell','WebFetch','WebSearch','mcp__design__design_image_generate','mcp__site-studio__web_export','unknown']) assert.equal(decide({tool_name:name})[0],'deny');
  for (const input of [null,[],{},'Write']) assert.equal(decide(input)[0],'deny');
  for(const {name} of TOOLS){const r=spawnSync(process.execPath,[path.join(__dirname,'../web-guard.js')],{input:JSON.stringify({tool_name:'mcp__site-studio__'+name}),encoding:'utf8',timeout:3000});assert.equal(r.status,0);assert.equal(r.stdout,'');}
  assert.equal(decide({tool_name:'mcp__web__web_set_text'})[0],'deny');
  for (const payload of ['{','null',JSON.stringify({tool_name:'Write'}),'x'.repeat(1048577)]) {
    const r = spawnSync(process.execPath,[path.join(__dirname,'../web-guard.js')],{input:payload,encoding:'utf8',timeout:3000});
    assert.equal(r.status,0); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision,'deny');
  }
});

test('five registration helpers handle spaces and shell metacharacters without writing config', async () => {
  const {clientConfig} = await import('../tools/mcp-config.mjs');
  const opts = {site:'/tmp/example site/$(no-command)',dataDir:'/tmp/state space',exportDir:'/tmp/export space',node:'/path with space/node',appRoot:'/plugin space'};
  for (const client of ['claude','codex','cursor','claude-desktop','deepseek']) {
    const output = clientConfig(client,opts);
    assert.match(output,/site-studio/); assert.match(output,/mcp-web\.js/);
    if (['cursor','claude-desktop'].includes(client)) {
      const row = JSON.parse(output).mcpServers['site-studio'];
      assert.equal(row.command,opts.node); assert.equal(row.args[2],opts.site);
    } else if (client === 'deepseek') assert.match(output,/@deepseek-ai\/dsh-mcp-client/);
    else assert.match(output,/'\/tmp\/example site\/\$\(no-command\)'/);
  }
  assert.throws(()=>clientConfig('invalid'),/Usage/);
  for (const key of ['site','dataDir','exportDir','appRoot']) for (const value of ['~','~/x','relative','']) assert.throws(()=>clientConfig('codex',{[key]:value}),/absolute path/);
  const bad = spawnSync(process.execPath,[path.join(__dirname,'../tools/mcp-config.mjs'),'--client','bad'],{encoding:'utf8'});
  assert.equal(bad.status,1); assert.equal(bad.stdout,'');
});
