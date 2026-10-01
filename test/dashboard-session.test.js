'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {fixture}=require('./helpers');const {createCoordinator}=require('../web-server');const {call,TOOLS}=require('../mcp-web');const {openSession}=require('./session-helper');
test('fragment exchange authorizes only session-header requests and never GET tokens',async t=>{
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const base=app.previewUrl;
 const post=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{Origin:base,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 for(const action of ['pause','resume','undo','redo','restore','delete_checkpoint','export'])for(const headers of [{},{Cookie:'site_studio_old=stolen'},{'x-site-studio-control':'a'.repeat(64)}])assert.equal((await post('/api/control',{action,expectedRev:0,confirmed:true},headers)).status,403);
 const launch=new URL(app.launchUrl);assert.equal(launch.search,'');assert.match(launch.hash,/^#cap=/);const cap=new URLSearchParams(launch.hash.slice(1)).get('cap');
 assert.equal((await fetch(base+'/open?cap='+cap)).status,403);
 for(const headers of [{Origin:'null'},{Origin:'http://127.0.0.1:1'},{'content-type':'text/plain'}])assert.notEqual((await post('/api/session',{cap},headers)).status,200);
 assert.equal((await post('/api/session',{cap:'wrong'})).status,403);
 const {token,headers}=await openSession(app.launchUrl);
 assert.equal((await post('/api/session',{cap})).status,403,'launch secret is consumed');
 for(const route of ['/','/open','/web-app.js']){
  const r=await fetch(base+route,{headers:{Cookie:'site_studio_old='+token}});assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);const html=await r.text();assert(!html.includes(token));assert(!html.includes(cap));
 }
 for(const route of ['/api/status','/api/events']){
  assert.equal((await fetch(base+route,{headers:{Cookie:'site_studio_old='+token}})).status,403);
  const r=await fetch(base+route,{headers});assert.equal(r.status,200);if(route.endsWith('events'))await r.body.cancel();
 }
 assert.equal((await post('/api/control',{action:'pause',expectedRev:0},headers)).status,200);assert(app.status.paused);
 const preview=JSON.stringify(call(app,'web_preview'));assert(!preview.includes(cap));assert(!preview.includes(token));
 assert(!TOOLS.some(t=>/(pause|resume|undo|redo|revert|restore|export|publish|save_over|capture_start|capture_stop)/.test(t.name)));
});
