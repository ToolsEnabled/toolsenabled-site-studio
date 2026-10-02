'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {fixture} = require('./helpers');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

test('Claude folder options launch literal paths and preserve Codex sample defaults', t => {
  const manifest = read('.claude-plugin/plugin.json');
  assert.equal(manifest.version, read('package.json').version);
  assert.equal(manifest.name, 'toolsenabled-site-studio');
  const codex = read('.codex-plugin/plugin.json');
  assert.deepEqual(codex.mcpServers, {'site-studio':{command:'node',args:['./mcp-web.js'],cwd:'./',env_vars:['SITE_STUDIO_ROOT','SITE_STUDIO_DATA']}});
  assert.deepEqual(Object.keys(read('.mcp.json').mcpServers),Object.keys(codex.mcpServers));
  const o = fixture(t);
  const options = {site_directory: path.join(o.root, 'site space $(literal)'), data_directory: path.join(o.root, 'state space'), export_directory: path.join(o.root, 'export space')};
  fs.cpSync(o.sourceRoot, options.site_directory, {recursive: true});
  const before = fs.readFileSync(path.join(options.site_directory, 'index.html'));
  const config = read('.mcp.json').mcpServers['site-studio'];
  assert.equal(config.command, 'node');
  assert.deepEqual(config.env,{SITE_STUDIO_ROOT:'${user_config.site_directory}',SITE_STUDIO_DATA:'${user_config.data_directory}'});
  for (const key of Object.keys(options)) assert.deepEqual([manifest.userConfig[key].type, manifest.userConfig[key].required], ['directory', true]);
  const args = config.args.map(arg => {
    let value = arg.replace('${CLAUDE_PLUGIN_ROOT}', root);
    for (const [key, text] of Object.entries(options)) value = value.replace('${user_config.' + key + '}', text);
    assert(!value.includes('${')); return value;
  });
  const messages = [{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'package-test',version:'1'}}}, {jsonrpc:'2.0',id:2,method:'tools/list'}, {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'web_pages',arguments:{}}}];
  const env = {...process.env}; delete env.DISPLAY;
  const p = spawnSync(process.execPath, args, {env, input:messages.map(m => JSON.stringify(m)).join('\n')+'\n', encoding:'utf8', timeout:5000});
  assert.equal(p.status, 0, p.stderr);
  const responses = p.stdout.trim().split('\n').map(s => JSON.parse(s));
  assert.equal(responses.length, 3);
  assert.equal(responses[0].result.serverInfo.version, manifest.version);
  assert.equal(responses[1].result.tools.length, 16);
  assert(!responses[2].result.isError);
  assert(fs.existsSync(path.join(options.data_directory, 'state.json')));
  assert(!fs.existsSync(path.join(options.data_directory, 'lease.json')));
  assert(!fs.existsSync(options.export_directory));
  assert.deepEqual(fs.readFileSync(path.join(options.site_directory, 'index.html')), before);
});

test('Desktop manifest starts the same direct server and build clock validates input', () => {
  const desktop = read('manifest.json'), code = read('.mcp.json').mcpServers['site-studio'];
  assert.equal(desktop.version, read('package.json').version);
  assert.deepEqual(desktop.server.mcp_config, {...code, args:code.args.map(s => s.replace('${CLAUDE_PLUGIN_ROOT}', '${__dirname}'))});
  assert.deepEqual(desktop.user_config, read('.claude-plugin/plugin.json').userConfig);
  const clock = path.join(root, 'tools/mcpb-clock.cjs');
  for (const epoch of ['', '-1', 'invalid', '1'.repeat(100000), '0']) {
    const p = spawnSync(process.execPath, ['--require',clock,'-e','process.exit(0)'], {env:{...process.env,SOURCE_DATE_EPOCH:epoch},encoding:'utf8',timeout:2000});
    assert.equal(p.status, 1, p.stderr);
  }
  const p = spawnSync(process.execPath, ['--require',clock,'-e','console.log(JSON.stringify([Date.now(),new Date().toISOString(),new Date(0).getTime()]))'], {env:{...process.env,SOURCE_DATE_EPOCH:'1767225600'},encoding:'utf8',timeout:2000});
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(JSON.parse(p.stdout), [1767225600000,'2026-01-01T00:00:00.000Z',0]);
});

test('configured folder paths must be absolute before any state is created', t => {
  const {options} = require('../src/options');
  const {createCoordinator} = require('../src/web-server');
  const o = fixture(t);
  for (const flag of ['--site','--data-dir','--export-dir']) {
    for (const value of ['', '.', 'relative/site', '~/site', '~person/site', '~', 'C:folder']) assert.throws(() => options([flag,value]), /absolute path/i);
    assert.equal(Object.values(options([flag,o.sourceRoot]))[0],o.sourceRoot);
  }
  for (const key of ['sourceRoot','dataRoot','exportRoot']) assert.throws(() => createCoordinator({...o,[key]:'~/site'}), /absolute path/i);
  for (const manifest of [read('.claude-plugin/plugin.json').userConfig,read('manifest.json').user_config]) {
    for (const key of ['site_directory','data_directory','export_directory']) assert.match(manifest[key].description,/^Absolute path/);
  }
});

test('Windows folder paths require a drive or UNC root', () => {
  const {absolutePath} = require('../src/options');
  for (const value of ['\\site','/site','C:site','~','~/site','relative']) assert.throws(() => absolutePath(value,'site',path.win32), /absolute path/i);
  for (const value of ['C:\\site','C:/site','\\\\server\\share\\site','\\\\?\\C:\\site']) assert.equal(absolutePath(value,'site',path.win32),value);
});

test('MCP instructions agree with the skill and security boundary for human controls', async t => {
  const client=require('./mcp-helper').start(fixture(t));t.after(()=>client.stop());
  const instructions=(await client.init()).result.instructions;
  const skill=fs.readFileSync(path.join(root,'skills/toolsenabled-site-studio/SKILL.md'),'utf8');
  const security=fs.readFileSync(path.join(root,'SECURITY.md'),'utf8');
  assert.match(instructions,/web_preview returns a clean URL/);
  assert.match(instructions,/human-only dashboard/);
  assert.match(instructions,/Never obtain.*launch.*secret/);
  for(const text of [instructions,skill,security])for(const operation of ['undo','restore','export'])assert(text.includes(operation));
  assert.match(skill,/dashboard is the human's/);assert.match(security,/not available as MCP tools/);assert.match(security,/require the dashboard session/);
  assert(!instructions.includes('human uses web_preview for'));
});


test('sensitive plugin options cannot travel in direct launch arguments',()=>{
 for(const [options,config] of [[read('.claude-plugin/plugin.json').userConfig,read('.mcp.json').mcpServers['site-studio']],[read('manifest.json').user_config,read('manifest.json').server.mcp_config]]){
  for(const [name,option] of Object.entries(options))if(option.sensitive){
   const launch={...config};delete launch.env;assert(!JSON.stringify(launch).includes('${user_config.'+name+'}'),'sensitive option outside env: '+name);
  }
 }
});

test('state and export folders cannot live inside the plugin installation',t=>{
 const {createCoordinator}=require('../src/web-server'),o=fixture(t);
 for(const key of ['dataRoot','exportRoot']){
  const target=path.join(root,'test-install-state-'+process.pid);
  assert(!fs.existsSync(target));let app;t.after(async()=>{await app?.close();fs.rmSync(target,{recursive:true,force:true});});
  assert.throws(()=>{app=createCoordinator({...o,[key]:target});},/outside the plugin installation/);
  assert(!fs.existsSync(target));
 }
});
