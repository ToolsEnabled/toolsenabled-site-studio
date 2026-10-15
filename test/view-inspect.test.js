'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers'),{createStore}=require('../src/studio-store');
test('read-only lease inspection reports identities and scope without taking or changing a lease',t=>{
 const {inspectLease}=require('../src/state-lease'),o=fixture(t);assert.equal(inspectLease(o.dataRoot).status,'absent');assert(!fs.existsSync(o.dataRoot));
 const store=createStore(o);t.after(()=>store.close());const file=path.join(o.dataRoot,'lease.json'),raw=fs.readFileSync(file),lease=JSON.parse(raw);
 assert.deepEqual(inspectLease(o.dataRoot),{status:'live',pid:process.pid,scopeMatches:true});assert.deepEqual(fs.readFileSync(file),raw);
 const changed=structuredClone(lease);changed.process.startTime+='0';fs.writeFileSync(file,JSON.stringify(changed));assert.equal(inspectLease(o.dataRoot).status,'dead');
 changed.scope.hostname+='other';fs.writeFileSync(file,JSON.stringify(changed));const before=fs.readFileSync(file);assert.equal(inspectLease(o.dataRoot).status,'unverifiable');assert.equal(inspectLease(o.dataRoot).scopeMatches,false);assert.deepEqual(fs.readFileSync(file),before);
 assert(!JSON.stringify(inspectLease(o.dataRoot)).includes(lease.nonce));fs.writeFileSync(file,raw);store.close();assert.equal(inspectLease(o.dataRoot).status,'absent');
});
test('export preflight reports destination, lock and source drift without writing or deleting',t=>{
 const {exportPreflight}=require('../src/web-publisher'),o=fixture(t),store=createStore(o);t.after(()=>store.close());const state=JSON.parse(fs.readFileSync(path.join(o.dataRoot,'state.json')));
 const args={...o,originalFingerprint:state.originalFingerprint};const entries=fs.readdirSync(o.root);let r=exportPreflight(args);assert.equal(r.ready,true);assert.equal(r.originalDrift,false);assert.equal(r.destinationExists,false);assert.deepEqual(fs.readdirSync(o.root),entries);
 assert.equal(exportPreflight({...args,exportRoot:undefined}).configured,false);
 fs.mkdirSync(o.exportRoot);assert.equal(exportPreflight(args).ready,false);
 const lock=path.join(o.root,'.site-studio-export-'+require('../src/web-model').hash(require('../src/native-filesystem').pathKey(o.exportRoot)).slice(7,31)+'.lock');fs.writeFileSync(lock,'{"pid":123}');const bytes=fs.readFileSync(lock);assert.equal(exportPreflight(args).lockPresent,true);assert.deepEqual(fs.readFileSync(lock),bytes);
 fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'drift');assert.equal(exportPreflight(args).originalDrift,true);
 assert.equal(exportPreflight({...args,exportRoot:path.join(o.dataRoot,'unsafe')}).pathsSafe,false);
});
