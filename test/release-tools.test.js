'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
// The Python workers load tools/*.py as modules; they must not leave a bytecode cache (__pycache__) in the plugin folder.
const pycache=()=>['tools','test'].flatMap(dir=>{const cache=path.join(__dirname,'..',dir,'__pycache__');return require('node:fs').existsSync(cache)?require('node:fs').readdirSync(cache).map(file=>dir+'/__pycache__/'+file):[];});
test('release sidecars require the pushed tag and exact downloaded bytes',()=>{
 const before=pycache();
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'release-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
 assert.deepEqual(pycache(),before,'the release worker left Python bytecode in the plugin folder');
});
test('handoff copies only verified inventory and detects keys inside archives and Git blobs',()=>{
 const before=pycache();
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'handoff-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
 assert.deepEqual(pycache(),before,'the handoff worker left Python bytecode in the plugin folder');
});
test('the test runner stops before tests for invalid native scratch paths',t=>{
 const fs=require('node:fs'),os=require('node:os'),{childEnv,tmpdirProblem,tmpdirLengthProblem}=require('./helpers');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-studio-runner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 if(process.platform==='win32'){
  const missing=path.join(root,'missing');
  for(const dir of ['relative',missing]){
   const p=spawnSync(process.execPath,[path.join(__dirname,'../tools/run-tests.js')],{cwd:root,encoding:'utf8',timeout:15000,env:{...childEnv(),TEMP:dir,TMP:dir}});
   assert.equal(p.status,2,p.stderr);assert.match(p.stderr,/Site Studio tests not started/);assert.doesNotMatch(p.stdout,/TAP version|# tests/);
  }
  const link=path.join(root,'link');fs.symlinkSync(root,link,'junction');
  assert.match(tmpdirProblem(link),/Windows TEMP custody check failed/);
  assert.equal(tmpdirProblem(os.tmpdir()),'');assert.equal(tmpdirLengthProblem('C:\\'+'x'.repeat(100)),'');return;
 }

 fs.mkdirSync(path.join(root,'relative'));const link=path.join(root,'link');fs.symlinkSync(root,link);
 const long=path.join(root,'x'.repeat(Math.max(1,62-root.length)));fs.mkdirSync(long);const bytes=Buffer.byteLength(long);assert(bytes>62);
 const run=dir=>spawnSync(process.execPath,[path.join(__dirname,'../tools/run-tests.js')],{cwd:root,encoding:'utf8',timeout:15000,env:{...childEnv(),TMPDIR:dir}});
 for(const [dir,message] of [['relative',/TMPDIR must be an absolute path; "relative" is relative/],[link,/TMPDIR must be its folder's real path: .* resolves to .*symbolic link/],[long,new RegExp(`TMPDIR is ${bytes} bytes long .*at most 62.*read ECONNRESET`)]]){
  const p=run(dir);assert.equal(p.status,2,p.stderr+p.stdout);assert.match(p.stderr,message);assert.doesNotMatch(p.stdout+p.stderr,/TAP version|# tests/);
 }
 // A real, absolute folder passes. root is TMPDIR plus 26 bytes, so with a TMPDIR of 37 to 62 bytes it is itself too long
 // for Chrome: hold it to the path rules only. TMPDIR, which the runner checked, passes all three.
 assert.equal(tmpdirProblem(root),tmpdirLengthProblem(root));assert.equal(tmpdirProblem(os.tmpdir()),'');assert.equal(tmpdirLengthProblem('/'+'x'.repeat(61)),'');assert.match(tmpdirLengthProblem('/'+'x'.repeat(62)),/TMPDIR is 63 bytes long/);
});
