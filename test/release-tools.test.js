'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('release sidecars require the pushed tag and exact downloaded bytes',()=>{
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'release-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
});
test('handoff copies only verified inventory and detects keys inside archives and Git blobs',()=>{
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'handoff-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
});
test('the test runner stops before any test when TMPDIR is relative, reached through a symbolic link or too long for Chrome',t=>{
 const fs=require('node:fs'),os=require('node:os'),{childEnv,tmpdirProblem,tmpdirLengthProblem}=require('./helpers');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-studio-runner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'relative'));const link=path.join(root,'link');fs.symlinkSync(root,link);
 const long=path.join(root,'x'.repeat(Math.max(1,62-root.length)));fs.mkdirSync(long);const bytes=Buffer.byteLength(long);assert(bytes>62);
 const run=dir=>spawnSync(process.execPath,[path.join(__dirname,'../tools/run-tests.js')],{cwd:root,encoding:'utf8',timeout:15000,env:{...childEnv(),TMPDIR:dir}});
 for(const [dir,message] of [['relative',/TMPDIR must be an absolute path; "relative" is relative/],[link,/TMPDIR must be its folder's real path: .* resolves to .*symbolic link/],[long,new RegExp(`TMPDIR is ${bytes} bytes long .*at most 62.*read ECONNRESET`)]]){
  const p=run(dir);assert.equal(p.status,2,p.stderr+p.stdout);assert.match(p.stderr,message);assert.doesNotMatch(p.stdout+p.stderr,/TAP version|# tests/);
 }
 assert.equal(tmpdirProblem(root),'');assert.equal(tmpdirLengthProblem('/'+'x'.repeat(61)),'');assert.match(tmpdirLengthProblem('/'+'x'.repeat(62)),/TMPDIR is 63 bytes long/);
});
