'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('release sidecars require the pushed tag and exact downloaded bytes',()=>{
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'release-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
});
test('handoff copies only verified inventory and detects keys inside archives and Git blobs',()=>{
 const p=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'handoff-worker.py')],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr+p.stdout);
});
