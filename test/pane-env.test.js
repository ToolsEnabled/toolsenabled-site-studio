'use strict';
// Real-child check of the pane reader environment. In Claude Code 2.1.287, $.process.run(argv, init)
// starts argv directly and sets init.env OVER the client's own environment ("Variables set over the
// host process's own environment"), so init.env alone never removes an inherited variable. The hook
// test facade refuses a real child, so this harness starts the exact launch hooks/view-contract.mjs
// builds for the pane, with that overlay rule. The probe reader prints variable NAMES only, never values.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {fixture}=require('./helpers'),{createStore}=require('../src/studio-store');
const root=path.join(__dirname,'..');
const CANARIES=['ANTHROPIC_API_KEY','CLAUDE_CODE_MESSAGING_TOKEN','CLAUDE_CODE_MESSAGING_SOCKET','CLAUDE_CODE_OAUTH_TOKEN','GITHUB_TOKEN','AWS_SECRET_ACCESS_KEY','SITE_STUDIO_ENV_CANARY','NODE_OPTIONS','NODE_PATH'];
// What the client process holds: its PATH and home plus synthetic credential-shaped values.
function clientEnv(){
 const env={PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin',HOME:os.homedir(),LANG:'C.UTF-8',SystemRoot:process.env.SystemRoot||'C:\\Windows',TEMP:process.env.TEMP||os.tmpdir(),TMP:process.env.TMP||os.tmpdir()};
 if(process.platform==='win32')env.SITE_STUDIO_WINDOWS_CANDIDATE=process.env.SITE_STUDIO_WINDOWS_CANDIDATE;
 for(const name of CANARIES)env[name]='synthetic-not-a-secret';
 return env;
}
// The 2.1.287 $.process.run contract: argv[0] started without a shell, init.cwd, init.timeoutMs, client env with init.env set over it.
function processRun({argv,init},env){
 const r=spawnSync(argv[0],argv.slice(1),{cwd:init.cwd,timeout:init.timeoutMs,env:{...env,...(init.env||{})},encoding:'utf8'});
 return {exitCode:r.status??1,stdout:r.stdout||'',stderr:r.stderr||(r.error?String(r.error.code||r.error.message):'')};
}
async function paneLaunch(pluginRoot,view,options){
 const {readerLaunch}=await import('../hooks/view-contract.mjs');const env=clientEnv();
 // The hook passes the values it reads with $.env.get('PATH') (and, before this fix, SystemRoot).
 return readerLaunch({root:pluginRoot,view,args:[],assets:false,options,offset:0,env:{PATH:env.PATH,SystemRoot:env.SystemRoot,TEMP:env.TEMP,TMP:env.TMP,SITE_STUDIO_WINDOWS_CANDIDATE:process.env.SITE_STUDIO_WINDOWS_CANDIDATE}});
}
const unused={site_directory:'/nonexistent/site',data_directory:'/nonexistent/state',export_directory:'/nonexistent/export'};
test('pane reader child receives only the OS allowlist and no credentials or Node startup injection',async t=>{
 const fake=fs.mkdtempSync(path.join(os.tmpdir(),'site-studio-env-'));t.after(()=>fs.rmSync(fake,{recursive:true,force:true}));
 fs.mkdirSync(path.join(fake,'tools'));
 if(process.platform==='win32')fs.copyFileSync(path.join(root,'tools','windows-pane.ps1'),path.join(fake,'tools','windows-pane.ps1'));
 const canary=path.join(fake,'preload-ran'),preload=path.join(fake,'poison.cjs');
 fs.writeFileSync(preload,'require("node:fs").writeFileSync('+JSON.stringify(canary)+',"unexpected loader")');
 fs.writeFileSync(path.join(fake,'tools','site-studio-view.js'),'process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))\n');
 const launch=await paneLaunch(fake,'home',unused);
 assert(process.platform==='win32'?JSON.parse(Buffer.from(launch.argv.at(-1),'base64').toString('utf16le')).args.includes(fake+'/tools/site-studio-view.js'):launch.argv.includes(path.join(fake,'tools','site-studio-view.js')),'the probe stands in for the reader at its installed path');
 const hostileEnv=clientEnv();hostileEnv.NODE_OPTIONS='--require '+JSON.stringify(preload);
 const result=processRun(launch,hostileEnv);
 assert.equal(fs.existsSync(canary),false,'ambient NODE_OPTIONS executed before the reader');
 assert.equal(result.exitCode,0,result.stderr);
 const names=JSON.parse(result.stdout);
 const leaked=names.filter(name=>CANARIES.includes(name));
 assert.deepEqual(leaked,[],'client variables reached the pane reader: '+leaked.join(', '));
 assert.deepEqual(names.map(n=>n.toUpperCase()).sort(),process.platform==='win32'?['PATH','SITE_STUDIO_WINDOWS_CANDIDATE','SYSTEMROOT','TEMP','TMP']:['PATH'],'pane reader environment names: '+names.join(', '));
});
test('the same launch runs the real reader for unopened and live working copies',async t=>{
 const o=fixture(t),options={site_directory:o.sourceRoot,data_directory:o.dataRoot,export_directory:o.exportRoot};
 let result=processRun(await paneLaunch(root,'doctor',options),clientEnv());
 assert.equal(result.exitCode,0,result.stderr);let page=JSON.parse(result.stdout);
 assert.equal(page.view,'doctor');assert.match(page.rows[0],/not opened yet/);
 const store=createStore(o);t.after(()=>store.close());
 result=processRun(await paneLaunch(root,'home',options),clientEnv());
 assert.equal(result.exitCode,0,result.stderr);page=JSON.parse(result.stdout);
 assert.equal(page.view,'home');assert(page.rows.some(row=>row.startsWith('Server lease: live')),page.rows.join('\n'));
});
