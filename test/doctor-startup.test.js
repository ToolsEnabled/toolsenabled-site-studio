'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers'),{view}=require('../src/site-view'),{createStore}=require('../src/studio-store');
async function rows(o){let p=await view({...o,view:'doctor'}),out=p.rows;while(p.nextOffset!==null){p=await view({...o,view:'doctor',offset:p.nextOffset,snapshot:p.snapshot});out=out.concat(p.rows);}return out.join('\n');}
test('unopened doctor distinguishes missing folders, empty state and non-empty startup refusal without writes',async t=>{
 const o=fixture(t);let text=await rows(o);assert(text.includes('not opened yet'));assert(text.includes('State folder: not created'));assert(!fs.existsSync(o.dataRoot));
 fs.mkdirSync(o.dataRoot,{mode:0o700});text=await rows(o);assert(text.includes('dedicated empty folder'));
 const file=path.join(o.dataRoot,'private-name-canary');fs.writeFileSync(file,'unrelated data');const before=fs.statSync(o.dataRoot).mtimeMs;
 text=await rows(o);assert(text.includes('non-empty'));assert(!text.includes('private-name-canary'));assert(!text.includes(o.root));assert.equal(fs.readFileSync(file,'utf8'),'unrelated data');assert.equal(fs.statSync(o.dataRoot).mtimeMs,before);assert(!fs.existsSync(path.join(o.dataRoot,'state.json')));
 fs.unlinkSync(file);const temp=path.join(o.dataRoot,'.lease-recovery-'+'a'.repeat(32));fs.writeFileSync(temp,'unread private claim');
 text=await rows(o);assert(text.includes('Lease metadata files: 1'));assert(text.includes('dedicated empty folder'));assert.equal(fs.readFileSync(temp,'utf8'),'unread private claim');
});
test('unopened doctor checks source and export parents and never repairs unverifiable leases',async t=>{
 const o=fixture(t);fs.mkdirSync(o.dataRoot,{mode:0o700});const lease=path.join(o.dataRoot,'lease.json');fs.writeFileSync(lease,'{}');const before=fs.readFileSync(lease);
 const text=await rows({...o,sourceRoot:path.join(o.root,'missing-source'),exportRoot:path.join(o.root,'missing-parent/export')});
 assert(text.includes('Site folder: missing or inaccessible'));assert(text.includes('Export parent: missing or inaccessible'));assert(text.includes('unverifiable'));assert(!text.includes(o.root));assert.deepEqual(fs.readFileSync(lease),before);
 assert(!fs.existsSync(path.join(o.root,'missing-parent')));assert(!fs.existsSync(path.join(o.root,'missing-source')));
 const parentOnly={...o,exportRoot:path.join(o.root,'missing-parent','export')};
 assert.throws(()=>createStore(parentOnly),/export parent folder must already exist/);
 assert(!fs.existsSync(path.join(o.root,'missing-parent')));assert.deepEqual(fs.readFileSync(lease),before,'a refused export parent must not touch the state folder');
});
