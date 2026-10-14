'use strict';
// Child programs for two test/delta.test.js checks (moved unchanged from two inline child programs in
// test/delta.test.js, apart from the require paths): each serves the preview over loopback HTTP and counts preview
// transformations. test/delta.test.js starts this file with one argument, transforms or failures; exit status 0
// means the check passed.
const name=process.argv[2];
if(name==='transforms'){
(async()=>{const assert=require('node:assert/strict');const cleanup=[];const o=require('./helpers').fixture({after:fn=>cleanup.push(fn)});const preview=require('../src/preview-content');const original=preview.previewBytes;let calls=0;preview.previewBytes=(...args)=>{calls++;return original(...args);};const app=require('../src/web-server').createCoordinator(o);try{await app.listen();const {url:base,headers}=await require('./session-helper').previewSession(app);for(let i=0;i<8;i++)await (await fetch(base+'/index.html?'+i,{headers})).text();assert.equal(calls,1);app.edit(require('./helpers').textOp(app.model,'Changed'));assert((await (await fetch(base+'/index.html',{headers})).text()).includes('Changed'));assert.equal(calls,2);}finally{await app.close();for(const fn of cleanup.reverse())await fn();}})().catch(e=>{console.error(e);process.exitCode=1;});
}
else if(name==='failures'){
(async()=>{const assert=require('node:assert/strict'),cleanup=[];const o=require('./helpers').fixture({after:fn=>cleanup.push(fn)});const preview=require('../src/preview-content');let calls=0;preview.previewBytes=()=>{calls++;throw Error('preview output limit');};const app=require('../src/web-server').createCoordinator(o);try{await app.listen();const session=await require('./session-helper').previewSession(app);for(let i=0;i<10;i++)assert.equal((await fetch(session.url+'/index.html?'+i,{headers:session.headers})).status,400);assert.equal(calls,1);app.edit(require('./helpers').textOp(app.model,'Changed'));assert.equal((await fetch(session.url+'/index.html',{headers:session.headers})).status,400);assert.equal(calls,2);}finally{await app.close();for(const fn of cleanup.reverse())await fn();}})().catch(e=>{console.error(e);process.exitCode=1;});
}
else{console.error('usage: preview-cache-worker.js transforms|failures');process.exitCode=2;}
