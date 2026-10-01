'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture,textOp}=require('./helpers');const {createCoordinator}=require('../web-server');const {browser}=require('./browser-helper');
test('headless dashboard live refresh accessibility human controls and inert preview',async t=>{
 const o=fixture(t);fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'<script>document.body.dataset.executed="yes";fetch("/api/status");</script>');const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());await b.navigate(app.launchUrl);await b.until('document.getElementById("status").textContent.includes("Revision 0")');
 assert(!await b.evaluate('document.cookie.includes("site_studio_")'),'HttpOnly session is not readable by dashboard JavaScript');
 const a11y=await b.evaluate(`(() => {const buttons=[...document.querySelectorAll('button')];document.getElementById('pause').focus();return {named:buttons.every(b=>b.textContent.trim()),pageLabel:document.querySelector('label[for="page"]').textContent,frameTitle:document.querySelector('iframe').title,dialog:document.querySelector('dialog').tagName,sandbox:document.querySelector('iframe').getAttribute('sandbox')};})()`);assert.deepEqual(a11y,{named:true,pageLabel:'Page',frameTitle:'Working copy preview',dialog:'DIALOG',sandbox:'allow-same-origin'});
 await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await b.evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid');
 app.edit(textOp(app.model,'Live headline'));await b.until('document.getElementById("status").textContent.includes("Revision 1")');await b.until('document.getElementById("preview").src.endsWith("rev=1")');
 await b.evaluate('document.getElementById("pause").click()');await b.until('document.getElementById("status").textContent.includes("Editing paused")');assert.throws(()=>app.edit(textOp(app.model)),/paused/);await b.evaluate('document.getElementById("pause").click()');await b.until('document.getElementById("status").textContent.includes("Ready for edits")');
 await b.evaluate('document.getElementById("undo").click()');await b.until('document.getElementById("status").textContent.includes("Revision 2")');assert.match(app.model.files.find(f=>f.path==='index.html').source,/>Home</);await b.evaluate('document.getElementById("redo").click()');await b.until('document.getElementById("status").textContent.includes("Revision 3")');assert.match(app.model.files.find(f=>f.path==='index.html').source,/Live headline/);
 await b.evaluate('document.getElementById("checkpoint-label").value="Human view";document.getElementById("save-checkpoint").click()');await b.until('[...document.querySelectorAll("#timeline .actor-human")].some(li=>li.textContent.includes("checkpoint · Saved checkpoint · Human view"))');
 app.checkpoint('Reviewed',3);await b.until('[...document.querySelectorAll("#checkpoints button")].some(b=>b.textContent.includes("Reviewed"))');app.edit(textOp(app.model,'Unwanted'));await b.until('document.getElementById("status").textContent.includes("Revision 4")');await b.evaluate('[...document.querySelectorAll("#checkpoints button")].find(b=>b.textContent.includes("Restore Agent checkpoint: Reviewed")).click()');await b.until('document.getElementById("status").textContent.includes("Revision 5")');assert.match(app.model.files.find(f=>f.path==='index.html').source,/Live headline/);
 await b.evaluate('document.getElementById("export").click()');assert.equal(await b.evaluate('document.querySelector("dialog").open'),true);assert.equal(fs.existsSync(o.exportRoot),false);await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.until('!document.querySelector("dialog").open');assert.equal(await b.evaluate('document.activeElement.id'),'export');
 await b.evaluate('document.getElementById("export").click();document.getElementById("confirm-export").click()');await b.until('document.getElementById("message").textContent.includes("Exported 4 files")');assert.match(fs.readFileSync(path.join(o.exportRoot,'index.html'),'utf8'),/Live headline/);assert.match(fs.readFileSync(path.join(o.sourceRoot,'index.html'),'utf8'),/>Home</);
 if(process.env.SITE_STUDIO_EVIDENCE_DIR){fs.mkdirSync(process.env.SITE_STUDIO_EVIDENCE_DIR,{recursive:true});const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SITE_STUDIO_EVIDENCE_DIR,'dashboard.png'),Buffer.from(shot.data,'base64'));}
 await b.navigate(await b.evaluate('document.getElementById("preview").src'));assert.equal(await b.evaluate('document.body.dataset.executed'),undefined);assert.equal(await b.evaluate('document.querySelector("h1").textContent'),'Live headline');assert.equal(await b.evaluate('getComputedStyle(document.querySelector("h1")).color'),'rgb(0, 0, 128)');
 await b.close();await app.close();
});
test('preview supports root-relative styles and navigation on its own origin',async t=>{
 const o=fixture(t);fs.writeFileSync(path.join(o.sourceRoot,'index.html'),'<html><head><link rel="stylesheet" href="/styles.css"></head><body><h1>Root styles</h1><a href="/nested/about.html">About</a></body></html>');const app=createCoordinator(o);t.after(()=>app.close());await app.listen();assert(app.siteUrl,'preview needs its own site origin');const b=await browser();t.after(()=>b.close());const preview=await require('./session-helper').previewBase(app);await b.navigate(preview+'/');assert.equal(await b.evaluate('getComputedStyle(document.querySelector("h1")).color'),'rgb(0, 0, 128)');await b.evaluate('document.querySelector("a").click()');await b.until('document.querySelector("h1")?.textContent === "About"');assert.equal((await fetch(app.siteUrl+'/api/status')).status,403);assert.equal((await fetch(app.siteUrl+'/',{headers:{Origin:'https://evil.test'}})).status,403);await b.close();await app.close();
});
test('included two-page sample renders at desktop and mobile widths',async t=>{
 const o=fixture(t);fs.rmSync(o.sourceRoot,{recursive:true});fs.cpSync(path.join(__dirname,'../site'),o.sourceRoot,{recursive:true});const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await require('./session-helper').previewBase(app);await b.navigate(preview+'/index.html');assert.match(await b.evaluate('document.querySelector("h1").textContent'),/Good design starts/);assert.equal(await b.evaluate('getComputedStyle(document.body).backgroundColor'),'rgb(243, 240, 231)');
 if(process.env.SITE_STUDIO_EVIDENCE_DIR){const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SITE_STUDIO_EVIDENCE_DIR,'sample-desktop.png'),Buffer.from(shot.data,'base64'));}
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert(await b.evaluate('document.documentElement.scrollWidth <= window.innerWidth'));if(process.env.SITE_STUDIO_EVIDENCE_DIR){const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SITE_STUDIO_EVIDENCE_DIR,'sample-mobile.png'),Buffer.from(shot.data,'base64'));}await b.navigate(preview+'/about.html');assert.match(await b.evaluate('document.querySelector("h1").textContent'),/Listen closely/);await b.close();await app.close();
});

test('another loopback port receives cookies but cannot recover the dashboard session',async t=>{
 const http=require('node:http');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();
 let stolen='';const foreign=http.createServer((req,res)=>{stolen=req.headers.cookie||'';res.end('<h1>Other origin</h1>');});await new Promise(r=>foreign.listen(0,'127.0.0.1',r));let b;t.after(async()=>{await b?.close();foreign.closeAllConnections();await new Promise(r=>foreign.close(r));});
 b=await browser();await b.navigate(app.launchUrl);await b.until('document.getElementById("status").textContent.includes("Revision 0")');
 assert.equal(await b.evaluate('location.hash'),'');assert.equal(await b.evaluate('window.siteStudioControl'),undefined);
 const token=await b.evaluate('sessionStorage.getItem("site-studio-session")');assert.match(token,/^[a-f0-9]{64}$/);
 await b.evaluate('document.cookie="site_studio_old=legacy-cookie; SameSite=Strict; Path=/"');
 await b.navigate('http://127.0.0.1:'+foreign.address().port+'/');assert.match(stolen,/legacy-cookie/);assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),null);
 const page=await (await fetch(app.previewUrl+'/',{headers:{Cookie:stolen}})).text();assert(!page.includes(token));
 assert.equal((await fetch(app.previewUrl+'/api/control',{method:'POST',headers:{Origin:app.previewUrl,Cookie:stolen,'Content-Type':'application/json'},body:'{"action":"pause","expectedRev":0}'})).status,403);assert.equal(app.status.paused,false);
 await b.navigate(app.previewUrl+'/');await b.until('document.getElementById("status").textContent.includes("Revision 0")');assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),token);
});

test('browser HTTPS requests never carry the preview capability in Referer',async t=>{
 const seen=[];let failure;const o=fixture(t),base='https://site-studio.invalid';
 const pages={
  'meta.html':'<meta name="referrer" content="unsafe-url"><img src="'+base+'/meta">',
  'element.html':'<img referrerpolicy="unsafe-url" src="'+base+'/element">',
  'redirect.html':'<meta name="referrer" content="no-referrer-when-downgrade"><img src="'+base+'/redirect">',
  'image.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><image width="20" height="20" referrerpolicy="unsafe-url" href="'+base+'/svg"/></svg>'
 };
 for(const [name,source] of Object.entries(pages))fs.writeFileSync(path.join(o.sourceRoot,name),source);
 const app=createCoordinator({...o,allowExternal:true});t.after(()=>app.close());await app.listen();const preview=await require('./session-helper').previewBase(app);const b=await browser();t.after(()=>b.close());
 b.on('Fetch.requestPaused',event=>{
  const {request,requestId}=event;seen.push({path:new URL(request.url).pathname,referer:Object.entries(request.headers).find(([k])=>k.toLowerCase()==='referer')?.[1]});
  const redirect=request.url.endsWith('/redirect');
  void b.send('Fetch.fulfillRequest',{requestId,responseCode:redirect?302:200,responseHeaders:redirect?[{name:'Location',value:base+'/redirected'},{name:'Referrer-Policy',value:'unsafe-url'}]:[{name:'Content-Type',value:'image/png'}],body:redirect?'':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='}).catch(e=>{failure=e;});
 });
 await b.send('Fetch.enable',{patterns:[{urlPattern:base+'/*',requestStage:'Request'}]});
 for(const name of Object.keys(pages))await b.navigate(preview+'/'+name);
 const end=Date.now()+4000;while(seen.length<5&&!failure&&Date.now()<end)await new Promise(r=>setTimeout(r,20));if(failure)throw failure;assert.equal(seen.length,5);for(const request of seen)assert.equal(request.referer,undefined,request.path);for(const [name,source] of Object.entries(pages))assert.equal(fs.readFileSync(path.join(o.sourceRoot,name),'utf8'),source);
});

test('browser neutralizes referrer overrides across imported parser-differential shapes',async t=>{
 const o=fixture(t),base='https://site-studio.invalid',meta='<meta name="referrer" content="unsafe-url">';
 const image=id=>'<img src="'+base+'/'+id+'">';
 const cases=[
  ['comment-short','<!-->'+meta+image('comment-short')+'<!-- -->'],
  ['comment-dash','<!--->'+meta+image('comment-dash')+'<!-- -->'],
  ['comment-bang','<!-- x --!>'+meta+image('comment-bang')+'<!-- -->'],
  ['declaration',"<!x '>"+meta+image('declaration')+"'>"],
  ['processing',"<?x '>"+meta+image('processing')+"'>"],
  ['end-tag',"</p '>"+meta+image('end-tag')+"'>"],
  ['script-close','<script></script/>'+meta+image('script-close')+'</script>'],
  ['style-close','<style></style x>'+meta+image('style-close')+'</style>'],
  ['title-close','<title></title/>'+meta+image('title-close')+'</title>'],
  ['svg-style','<svg><style>'+meta+image('svg-style')+'</style></svg>'],
  ['svg-textarea','<svg><textarea>'+meta+image('svg-textarea')+'</textarea></svg>'],
  ['math-style','<math><style>'+meta+image('math-style')+'</style></math>'],
  ['dropped-textarea','<textarea a"b"c>'+meta+image('dropped-textarea')+'</textarea>'],
  ['dropped-script','<script a"b"c>'+meta+image('dropped-script')+'</script>'],
  ['svg-pi','<svg xmlns="http://www.w3.org/2000/svg">'+"<?x '?>"+'<h:meta xmlns:h="http://www.w3.org/1999/xhtml" name="referrer" content="unsafe-url"/>'+'<image width="1" height="1" href="'+base+'/svg-pi"/>'+"'?>"+'</svg>','svg'],
  ['svg-meta','<svg xmlns="http://www.w3.org/2000/svg"><h:meta xmlns:h="http://www.w3.org/1999/xhtml" name="referrer" content="unsafe-url"/><image width="1" height="1" href="'+base+'/svg-meta"/></svg>','svg'],
  ['element-policy','<img referrerpolicy="unsafe-url" src="'+base+'/element-policy">'],
  ['stylesheet-policy','<link rel="stylesheet" referrerpolicy="unsafe-url" href="'+base+'/stylesheet-policy">'],
  ['anchor-rel','<a href="'+base+'/anchor-rel" rel="opener" referrerpolicy="unsafe-url">Go</a>'],
 ];
 for(const [id,source,ext='html'] of cases)fs.writeFileSync(path.join(o.sourceRoot,id+'.'+ext),source);
 const seen=[],app=createCoordinator({...o,allowExternal:true});t.after(()=>app.close());await app.listen();const preview=await require('./session-helper').previewBase(app);const b=await browser();t.after(()=>b.close());let failure;
 b.on('Fetch.requestPaused',event=>{seen.push({path:new URL(event.request.url).pathname,referer:Object.entries(event.request.headers).find(([k])=>k.toLowerCase()==='referer')?.[1]});void b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:event.request.url.endsWith('stylesheet-policy')?'text/css':'image/png'}],body:''}).catch(e=>{failure=e;});});
 await b.send('Fetch.enable',{patterns:[{urlPattern:base+'/*',requestStage:'Request'}]});
 const leaks=[],missing=[],relMissing=[];
 for(const [id,source,ext='html'] of cases){
  const count=seen.length;await b.navigate(preview+'/'+id+'.'+ext);await b.until('document.readyState === "complete"');
  if(id==='anchor-rel'){if(!(await b.evaluate('document.querySelector("a").rel')).split(/\s+/).includes('noreferrer'))relMissing.push(id);await b.evaluate('document.querySelector("a").click()');}
  const end=Date.now()+300;while(seen.length===count&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
  if(failure)throw failure;
  for(const req of seen.slice(count))if(req.referer)leaks.push(id);
  // Dropping a malformed raw element must leave its hidden image inert. Others should still load.
  if(!id.startsWith('dropped-')&&seen.length===count)missing.push(id);
  assert.equal(fs.readFileSync(path.join(o.sourceRoot,id+'.'+ext),'utf8'),source);
 }
 assert.deepEqual(leaks,[],'capability-bearing Referer on: '+leaks.join(', '));assert.deepEqual(relMissing,[]);assert.deepEqual(missing,[],'fixture did not make a request: '+missing.join(', '));
});
