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

test('preview reads require a scoped HttpOnly cookie issued only by an authenticated POST',async t=>{
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const base=app.previewUrl;
 const {headers}=await openSession(app.launchUrl);
 let status=await (await fetch(base+'/api/status',{headers})).json();assert.match(status.previewUrl,/\/preview\/[a-f0-9]{24}$/);
 const post=(extra={},body='{}')=>fetch(base+'/api/preview-session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},body});
 assert.equal((await post()).status,403);assert.equal((await post({...headers,Origin:'null'})).status,403);assert.equal((await post({...headers,Origin:''})).status,403);assert.equal((await post({...headers,'Content-Type':'text/plain'})).status,415);assert.equal((await post(headers,'{"extra":1}')).status,400);
 const issued=await post(headers);assert.equal(issued.status,200);status=await (await fetch(base+'/api/status',{headers})).json();const setCookie=issued.headers.get('set-cookie');assert.match(setCookie,/; HttpOnly; SameSite=Strict$/);assert(setCookie.includes('; Path='+new URL(status.previewUrl).pathname+'/;'));
 const cookie=setCookie.split(';')[0],cap=cookie.slice(cookie.indexOf('=')+1);assert.match(cap,/^[a-f0-9]{64}$/);assert(!JSON.stringify(status).includes(cap));assert(!(await issued.text()).includes(cap));assert(!JSON.stringify(call(app,'web_preview')).includes(cap));
 const preview=status.previewUrl+'/index.html';
 for(const auth of [{},{...headers},{Cookie:cookie+'; '+cookie},{Cookie:cookie+'x'}])assert.equal((await fetch(preview,{headers:auth})).status,403);
 const page=await fetch(preview,{headers:{Cookie:cookie}});assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert(!(await page.text()).includes(cap));
 for(const route of ['/','/open','/api/preview-session']){const r=await fetch(base+route,{headers:{Cookie:cookie}});assert.equal(r.headers.get('set-cookie'),null);assert(!(await r.text()).includes(cap));}
 for(const route of ['/api/status','/api/events'])assert.equal((await fetch(base+route,{headers:{Cookie:cookie}})).status,403);
 assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:'{"action":"pause","expectedRev":0}'})).status,403);assert(!app.status.paused);
 assert.equal((await post({Cookie:cookie})).status,403);
});

test('preview sessions rotate and concurrent repairs reuse the current rotation',async t=>{
 const {issuePreview}=require('./session-helper');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const {headers}=await openSession(app.launchUrl);
 const first=await issuePreview(app.previewUrl,headers);assert.equal((await fetch(first.url+'/index.html',{headers:first.headers})).status,200);
 const second=await issuePreview(app.previewUrl,headers);assert.notEqual(second.url,first.url);assert.notEqual(second.headers.Cookie,first.headers.Cookie);
 assert.equal((await fetch(first.url+'/index.html',{headers:first.headers})).status,403);assert.equal((await fetch(second.url+'/index.html',{headers:first.headers})).status,403);
 const body=await (await fetch(second.url+'/index.html',{headers:second.headers})).text();assert(body.includes(new URL(second.url).pathname+'/styles.css'));assert(!body.includes(new URL(first.url).pathname));
 const repair=async()=>{const r=await fetch(app.previewUrl+'/api/preview-session',{method:'POST',headers:{...headers,Origin:app.previewUrl,'Content-Type':'application/json'},body:JSON.stringify({previewId:second.url.split('/').at(-1)})});assert.equal(r.status,200);return {url:(await r.json()).previewUrl,cookie:r.headers.getSetCookie()[0]};};
 const [a,b]=await Promise.all([repair(),repair()]);assert.notEqual(a.url,second.url);assert.equal(a.url,b.url);assert.equal(a.cookie,b.cookie);
 assert.equal((await fetch(a.url+'/index.html',{headers:{Cookie:a.cookie.split(';')[0]}})).status,200);
});

test('only the current dashboard can reissue a link and revoke old capabilities',async t=>{
 const {issuePreview}=require('./session-helper');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const oldLaunch=app.launchUrl,base=app.previewUrl;
 const {headers}=await openSession(oldLaunch),preview=await issuePreview(base,headers);
 const post=(extra={},body={expectedRev:0})=>fetch(base+'/api/session/reissue',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 for(const extra of [{},{Cookie:preview.headers.Cookie},{...headers,Origin:'null'}])assert.equal((await post(extra)).status,403);
 assert.equal((await post(headers,{expectedRev:9})).status,409);assert.equal((await post(headers,{expectedRev:0,extra:true})).status,400);
 assert.equal((await fetch(base+'/api/session/reissue',{headers})).status,404);
 const response=await post(headers);assert.equal(response.status,200);const {launchUrl}=await response.json();assert.notEqual(launchUrl,oldLaunch);assert.equal(launchUrl,app.launchUrl);
 assert.equal((await post(headers)).status,403);assert.equal((await fetch(base+'/api/status',{headers})).status,403);
 assert.equal((await fetch(preview.url+'/index.html',{headers:preview.headers})).status,403);
 const newSession=await openSession(launchUrl);assert.notEqual(newSession.headers['x-site-studio-control'],headers['x-site-studio-control']);
 assert.equal((await fetch(base+'/api/status',{headers:newSession.headers})).status,200);
 assert(!JSON.stringify(call(app,'web_preview')).includes(new URL(launchUrl).hash.slice(5)));
 assert(!TOOLS.some(t=>/session|reissue/.test(t.name)));
});
