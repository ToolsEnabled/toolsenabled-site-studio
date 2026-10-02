'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture,textOp}=require('./helpers');const {createCoordinator}=require('../web-server');const {browser,browserPreview}=require('./browser-helper');
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
 const o=fixture(t);fs.writeFileSync(path.join(o.sourceRoot,'index.html'),'<html><head><link rel="stylesheet" href="/styles.css"></head><body><h1>Root styles</h1><a href="/nested/about.html">About</a></body></html>');const app=createCoordinator(o);t.after(()=>app.close());await app.listen();assert(app.siteUrl,'preview needs its own site origin');const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);await b.navigate(preview+'/');assert.equal(await b.evaluate('getComputedStyle(document.querySelector("h1")).color'),'rgb(0, 0, 128)');await b.navigate(await b.evaluate('document.querySelector("a").href'));await b.until('document.querySelector("h1")?.textContent === "About"');assert.equal((await fetch(app.siteUrl+'/api/status')).status,403);assert.equal((await fetch(app.siteUrl+'/',{headers:{Origin:'https://evil.test'}})).status,403);await b.close();await app.close();
});
test('included two-page sample renders at desktop and mobile widths',async t=>{
 const o=fixture(t);fs.rmSync(o.sourceRoot,{recursive:true});fs.cpSync(path.join(__dirname,'../site'),o.sourceRoot,{recursive:true});const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);await b.navigate(preview+'/index.html');assert.match(await b.evaluate('document.querySelector("h1").textContent'),/Good design starts/);assert.equal(await b.evaluate('getComputedStyle(document.body).backgroundColor'),'rgb(243, 240, 231)');
 if(process.env.SITE_STUDIO_EVIDENCE_DIR){const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SITE_STUDIO_EVIDENCE_DIR,'sample-desktop.png'),Buffer.from(shot.data,'base64'));}
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert(await b.evaluate('document.documentElement.scrollWidth <= window.innerWidth'));if(process.env.SITE_STUDIO_EVIDENCE_DIR){const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SITE_STUDIO_EVIDENCE_DIR,'sample-mobile.png'),Buffer.from(shot.data,'base64'));}await b.navigate(preview+'/about.html');assert.match(await b.evaluate('document.querySelector("h1").textContent'),/Listen closely/);await b.close();await app.close();
});

test('another loopback port receives cookies but cannot recover the dashboard session',async t=>{
 const http=require('node:http');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();
 let stolen='';const foreign=http.createServer((req,res)=>{if(req.url.endsWith('/other'))stolen=req.headers.cookie||'';res.end('<h1>Other origin</h1>');});await new Promise(r=>foreign.listen(0,'127.0.0.1',r));let b;t.after(async()=>{await b?.close();foreign.closeAllConnections();await new Promise(r=>foreign.close(r));});
 b=await browser();await b.navigate(app.launchUrl);await b.until('document.getElementById("status").textContent.includes("Revision 0")');
 assert.equal(await b.evaluate('location.hash'),'');assert.equal(await b.evaluate('window.siteStudioControl'),undefined);
 const token=await b.evaluate('sessionStorage.getItem("site-studio-session")');assert.match(token,/^[a-f0-9]{64}$/);const preview=await b.evaluate('state.previewUrl');
 await b.evaluate('document.cookie="site_studio_old=legacy-cookie; SameSite=Strict; Path=/"');
 await b.navigate('http://127.0.0.1:'+foreign.address().port+new URL(preview).pathname+'/other');await b.evaluate('new Promise(resolve=>setTimeout(resolve,150)).then(()=>fetch("/favicon.ico"))');assert.match(stolen,/legacy-cookie/);assert.match(stolen,/site_studio_preview_[a-f0-9]{24}=[a-f0-9]{64}/);assert(!stolen.includes(token));assert.equal((await fetch(preview+'/index.html',{headers:{Cookie:stolen}})).status,200);assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),null);
 const page=await (await fetch(app.previewUrl+'/',{headers:{Cookie:stolen}})).text();assert(!page.includes(token));
 assert.equal((await fetch(app.previewUrl+'/api/control',{method:'POST',headers:{Origin:app.previewUrl,Cookie:stolen,'Content-Type':'application/json'},body:'{"action":"pause","expectedRev":0}'})).status,403);assert.equal(app.status.paused,false);
 await b.navigate(app.previewUrl+'/');await b.until('document.getElementById("status").textContent.includes("Revision 0")');assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),token);
});

test('browser HTTPS requests never carry the preview capability in Referer',async t=>{
 const seen=[];const o=fixture(t),base='https://site-studio.invalid';
 const pages={
  'meta.html':'<meta name="referrer" content="unsafe-url"><img src="'+base+'/meta">',
  'element.html':'<img referrerpolicy="unsafe-url" src="'+base+'/element">',
  'redirect.html':'<meta name="referrer" content="no-referrer-when-downgrade"><img src="'+base+'/redirect">',
  'image.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><image width="20" height="20" referrerpolicy="unsafe-url" href="'+base+'/svg"/></svg>'
 };
 for(const [name,source] of Object.entries(pages))fs.writeFileSync(path.join(o.sourceRoot,name),source);
 const app=createCoordinator({...o,allowExternal:true});t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);
 await b.navigate('about:blank');
 const topFrame=(await b.send('Page.getFrameTree')).frameTree.frame.id;
 b.on('Fetch.requestPaused',async event=>{
  const {request,requestId}=event;if(event.frameId===topFrame)seen.push({path:new URL(request.url).pathname,referer:Object.entries(request.headers).find(([k])=>k.toLowerCase()==='referer')?.[1]});
  const redirect=request.url.endsWith('/redirect');
  await b.send('Fetch.fulfillRequest',{requestId,responseCode:redirect?302:200,responseHeaders:redirect?[{name:'Location',value:base+'/redirected'},{name:'Referrer-Policy',value:'unsafe-url'}]:[{name:'Content-Type',value:'image/png'}],body:redirect?'':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='});
 });
 await b.send('Fetch.enable',{patterns:[{urlPattern:base+'/*',requestStage:'Request'}]});
 await b.evaluate('new Promise(resolve=>{const frame=document.createElement("iframe");frame.onload=()=>resolve();frame.src='+JSON.stringify(base+'/subframe')+';document.body.append(frame);})');
 for(const name of Object.keys(pages))await b.navigate(preview+'/'+name);
 const end=Date.now()+4000;while(seen.length<5&&Date.now()<end)await new Promise(r=>setTimeout(r,20));await b.settleEvents();assert.equal(seen.length,5);for(const request of seen)assert.equal(request.referer,undefined,request.path);for(const [name,source] of Object.entries(pages))assert.equal(fs.readFileSync(path.join(o.sourceRoot,name),'utf8'),source);
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
 const seen=[],app=createCoordinator({...o,allowExternal:true});t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);
 b.on('Fetch.requestPaused',async event=>{seen.push({path:new URL(event.request.url).pathname,referer:Object.entries(event.request.headers).find(([k])=>k.toLowerCase()==='referer')?.[1]});await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:event.request.url.endsWith('stylesheet-policy')?'text/css':'image/png'}],body:''});});
 await b.send('Fetch.enable',{patterns:[{urlPattern:base+'/*',requestStage:'Request'}]});
 const leaks=[],missing=[],relMissing=[];
 for(const [id,source,ext='html'] of cases){
  const count=seen.length;await b.navigate(preview+'/'+id+'.'+ext);await b.until('document.readyState === "complete"');
  if(id==='anchor-rel'){if(!(await b.evaluate('document.querySelector("a").rel')).split(/\s+/).includes('noreferrer'))relMissing.push(id);await b.evaluate('document.querySelector("a").click()');}
  const end=Date.now()+300;while(seen.length===count&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
  await b.settleEvents();
  for(const req of seen.slice(count))if(req.referer)leaks.push(id);
  // Dropping a malformed raw element must leave its hidden image inert. Others should still load.
  if(!id.startsWith('dropped-')&&seen.length===count)missing.push(id);
  assert.equal(fs.readFileSync(path.join(o.sourceRoot,id+'.'+ext),'utf8'),source);
 }
 assert.deepEqual(leaks,[],'capability-bearing Referer on: '+leaks.join(', '));assert.deepEqual(relMissing,[]);assert.deepEqual(missing,[],'fixture did not make a request: '+missing.join(', '));
});

test('preview preserves legacy rendering mode and named attribute entities',async t=>{
 const o=fixture(t),source='<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><html><body><a title="Wait&hellip; &copy;" href="about.html">Next</a></body></html>';
 fs.writeFileSync(path.join(o.sourceRoot,'index.html'),source);const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);await b.navigate(preview+'/index.html');assert.deepEqual(await b.evaluate('({mode:document.compatMode,title:document.querySelector("a").title})'),{mode:'BackCompat',title:'Wait… ©'});assert.equal(fs.readFileSync(path.join(o.sourceRoot,'index.html'),'utf8'),source);
});

test('SVG CDATA styling and Illustrator namespace subsets render without XML errors',async t=>{
 const o=fixture(t);const source='<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_svg "http://www.w3.org/2000/svg"><!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">]><svg xmlns="&ns_svg;" xmlns:i="&ns_ai;" width="20" height="20"><style><![CDATA[.paint { fill: red; }]]></style><rect class="paint" width="10" height="10"/></svg>';
 fs.writeFileSync(path.join(o.sourceRoot,'art.svg'),source);const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);await b.navigate(preview+'/art.svg');assert.equal(await b.evaluate('document.querySelector("parsererror")?.textContent'),undefined);assert.equal(await b.evaluate('getComputedStyle(document.querySelector("rect")).fill'),'rgb(255, 0, 0)');assert.equal(fs.readFileSync(path.join(o.sourceRoot,'art.svg'),'utf8'),source);
});

test('preview URL and hostile foreign markup cannot disclose the cookie read capability',async t=>{
 const o=fixture(t),remote='https://site-studio.invalid';const meta='<meta name="referrer" content="unsafe-url">';const cases=[];
 for(const [id,head] of [['foreign','<svg><foreignObject><textarea>'],['desc','<svg><desc><textarea>'],['math','<math><mtext><textarea>'],['slash','<svg/x><textarea>']])cases.push([id,head+'<p title=\'</textarea>'+meta+'\'>X</p></textarea></foreignObject></desc></svg></mtext></math><img src="'+remote+'/'+id+'">','html']);
 for(const [id,head] of [['spaced-self','<svg/ >'],['attr-self','<svg x=a/>'],['ignored-end','<svg><desc><p></svg>']])cases.push([id,head+'<style>'+meta+'</style></p></desc></svg><img src="'+remote+'/'+id+'">','html']);
 for(const [id,root] of [['xhtml','html xmlns="http://www.w3.org/1999/xhtml"'],['prefixed','s:svg xmlns:s="http://www.w3.org/2000/svg"']])for(const raw of ['title','style'])cases.push([id+'-'+raw,'<'+root+'><'+raw+'><meta xmlns="http://www.w3.org/1999/xhtml" name="referrer" content="unsafe-url"/></'+raw+'><image xmlns="http://www.w3.org/2000/svg" width="1" height="1" href="'+remote+'/'+id+'-'+raw+'"/></'+root.split(' ')[0]+'>','svg']);
 for(const [id,source,ext] of cases)fs.writeFileSync(path.join(o.sourceRoot,id+'.'+ext),source);
 const app=createCoordinator({...o,allowExternal:true});t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());await b.navigate(app.launchUrl);await b.until('document.getElementById("status").textContent.includes("Revision 0")');const preview=await b.evaluate('state.previewUrl');
 const cookies=(await b.send('Network.getAllCookies')).cookies;const cookie=cookies.find(c=>c.name.startsWith('site_studio_preview_'));assert(cookie,'preview uses a cookie, not a URL capability');assert(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,new URL(preview).pathname+'/');assert(!preview.includes(cookie.value));assert.equal(await b.evaluate('document.cookie.includes("site_studio_preview_")'),false);
 const failures=[];await b.send('Network.enable');b.on('Network.loadingFailed',e=>failures.push(e));const seen=[];b.on('Fetch.requestPaused',async e=>{try{await b.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='});seen.push(e.request);}catch(error){await new Promise(r=>setTimeout(r,100));error.message+=' '+JSON.stringify({event:e,failures});throw error;}});await b.send('Fetch.enable',{patterns:[{urlPattern:remote+'/*',requestStage:'Request'}]});
 for(const [id,source,ext] of cases){const count=seen.length;await b.navigate(preview+'/'+id+'.'+ext);const end=Date.now()+500;while(seen.length===count&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert(seen.length>count,'external request observed for '+id);assert.equal(await b.evaluate('document.cookie.includes("site_studio_preview_")'),false);assert.equal(fs.readFileSync(path.join(o.sourceRoot,id+'.'+ext),'utf8'),source);}
 await b.settleEvents();for(const request of seen){assert(!JSON.stringify(request).includes(cookie.value));assert.equal(Object.entries(request.headers).find(([k])=>k.toLowerCase()==='referer'),undefined,request.url);}
 assert.equal((await fetch(preview+'/index.html')).status,403,'copied URL alone grants no read access');
});

test('preview legacy attribute references match the browser HTML parser',async t=>{
 const values=['&copy 2024','&#169','&#xA9','&#169x','&copyé','&copycat','&copy=1','&notin','&notin;','&hellip','&amp;copy'];
 const source=values.map((v,i)=>'<p id="e'+i+'" title="'+v+'">Text</p>').join('');const o=fixture(t);fs.writeFileSync(path.join(o.sourceRoot,'index.html'),source);const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());const preview=await browserPreview(b,app);await b.navigate(preview+'/index.html');
 const titles=await b.evaluate('[...document.querySelectorAll("p")].map(p=>p.title)');const expected=await b.evaluate('Array.from(new DOMParser().parseFromString('+JSON.stringify(source)+',"text/html").querySelectorAll("p"),p=>p.title)');assert.deepEqual(titles,expected);
});

test('dashboard repairs preview cookie shadows and eviction without granting controls to cookies',async t=>{
 const http=require('node:http');let cookies=[];const foreign=http.createServer((req,res)=>{res.setHeader('Set-Cookie',cookies);res.end('<p>Other loopback server</p>');});await new Promise(r=>foreign.listen(0,'127.0.0.1',r));
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const b=await browser();t.after(async()=>{await b.close();foreign.closeAllConnections();await new Promise(r=>foreign.close(r));});
 const responses=[];await b.send('Network.enable');b.on('Network.responseReceived',e=>responses.push(e.response));await browserPreview(b,app);const token=await b.evaluate('sessionStorage.getItem("site-studio-session")');
 async function cookieFor(url){return (await b.send('Network.getAllCookies')).cookies.find(c=>c.name==='site_studio_preview_'+url.split('/').at(-1)&&c.path===new URL(url).pathname+'/');}
 async function otherPort(check){const {targetId}=await b.send('Target.createTarget',{url:'http://127.0.0.1:'+foreign.address().port+'/'},true);try{const end=Date.now()+3000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('other port cookie response was not applied');}finally{await b.send('Target.closeTarget',{targetId},true);}}
 async function repair(old){await b.evaluate('document.getElementById("preview").src='+JSON.stringify(old+'/index.html?toss=1'));await b.until('state.previewUrl !== '+JSON.stringify(old));const next=await b.evaluate('state.previewUrl');const end=Date.now()+3000;while(!responses.some(r=>r.url.startsWith(next+'/index.html')&&r.status===200)&&Date.now()<end)await new Promise(r=>setTimeout(r,20));assert(responses.some(r=>r.url.startsWith(next+'/index.html')&&r.status===200),'repaired iframe loaded');return next;}
 let preview=await b.evaluate('state.previewUrl'),cookie=await cookieFor(preview);const shadowPath=new URL(preview).pathname+'/index.html';cookies=[cookie.name+'='+'0'.repeat(64)+'; HttpOnly; SameSite=Strict; Path='+shadowPath];
 await otherPort(async()=>(await b.send('Network.getAllCookies')).cookies.some(c=>c.name===cookie.name&&c.path===shadowPath));preview=await repair(preview);cookie=await cookieFor(preview);assert(cookie);
 cookies=Array.from({length:200},(_,i)=>'junk_'+i+'=x; SameSite=Strict; Path=/');await otherPort(async()=>!(await cookieFor(preview)));preview=await repair(preview);assert(await cookieFor(preview));
 cookie=await cookieFor(preview);cookies=[cookie.name+'='+'0'.repeat(64)+'; HttpOnly; SameSite=Strict; Path='+cookie.path];await otherPort(async()=>(await cookieFor(preview))?.value==='0'.repeat(64));
 await b.evaluate('document.getElementById("preview").src='+JSON.stringify(preview+'/index.html?overwrite=1'));await b.until('document.getElementById("message").textContent.includes("Preview session could not be restored")');assert.equal(await b.evaluate('state.previewUrl'),preview,'automatic repair is bounded');
 await b.evaluate('document.getElementById("refresh").click()');await b.until('state.previewUrl !== '+JSON.stringify(preview));preview=await b.evaluate('state.previewUrl');
 assert.deepEqual(await b.evaluate('({label:document.getElementById("refresh").textContent,stale:document.getElementById("message").textContent.includes("Preview session could not be restored")})'),{label:'Refresh preview',stale:false});
 assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),token);await b.evaluate('document.getElementById("pause").click()');await b.until('document.getElementById("status").textContent.includes("Editing paused")');
 const current=await cookieFor(preview);assert.equal((await fetch(app.previewUrl+'/api/status',{headers:{Cookie:current.name+'='+current.value}})).status,403);
 await b.navigate(app.previewUrl+'/');await b.until('document.getElementById("status").textContent.includes("Revision 0")');assert.notEqual(await b.evaluate('state.previewUrl'),preview,'dashboard load rotates the session');
});

test('dashboard renewal ignores double-clicks and remains usable after reload',async t=>{
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());await browserPreview(b,app);
 const before=await b.evaluate('sessionStorage.getItem("site-studio-session")');
 await b.evaluate('document.getElementById("new-session").click();document.getElementById("new-session").click()');
 await b.until('!!sessionStorage.getItem("site-studio-session") && sessionStorage.getItem("site-studio-session")!=='+JSON.stringify(before));
 await b.until('!document.getElementById("new-session").disabled');
 assert.equal(await b.evaluate('document.getElementById("replacement-session").hidden'),true);
 await b.navigate(app.previewUrl+'/');await b.until('document.getElementById("status").textContent.includes("Revision 0")');
 await b.evaluate('document.getElementById("pause").click()');await b.until('document.getElementById("status").textContent.includes("Editing paused")');
 assert(!await b.evaluate('document.getElementById("message").textContent.includes("session required")'));
});

test('explicit browser move retains its replacement link across reloads',async t=>{
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());await browserPreview(b,app);
 await b.evaluate('document.getElementById("move-session").click();document.getElementById("move-session").click()');await b.until('!document.getElementById("replacement-session").hidden');
 const link=await b.evaluate('document.getElementById("replacement-link").href');assert.equal(link,app.launchUrl);assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-session")'),null);
 await b.navigate(app.previewUrl+'/');await b.until('!document.getElementById("replacement-session").hidden');assert.equal(await b.evaluate('document.getElementById("replacement-link").href'),link);
 await b.evaluate('document.getElementById("replacement-link").click()');await b.until('!!sessionStorage.getItem("site-studio-session") && document.getElementById("status").textContent.includes("Revision 0")');
 assert.equal(await b.evaluate('sessionStorage.getItem("site-studio-replacement")'),null);
 await b.evaluate('document.getElementById("pause").click()');await b.until('document.getElementById("status").textContent.includes("Editing paused")');
});

test('dashboard explains preview omissions and whole-file failures',async t=>{
 const o=fixture(t);fs.writeFileSync(path.join(o.sourceRoot,'index.html'),'<h1>Visible</h1><img src="data:image/png;base64,'+'x'.repeat(70000)+'" alt="kept">');fs.writeFileSync(path.join(o.sourceRoot,'too-big.css'),'a{background:'+'url(x) '.repeat(280000)+'}');
 const app=createCoordinator(o);t.after(()=>app.close());await app.listen();const b=await browser();t.after(()=>b.close());await browserPreview(b,app);
 await b.until('document.getElementById("preview-message")?.textContent.includes("attribute")');
 const preview=await b.evaluate('state.previewUrl');const cookies=(await b.send('Network.getCookies',{urls:[preview+'/too-big.css']})).cookies;
 const headers={Cookie:cookies.map(c=>c.name+'='+c.value).join('; ')};
 assert.equal((await fetch(preview+'/too-big.css',{headers})).status,400);
 await b.until('document.getElementById("preview-message").textContent.includes("too-big.css") && document.getElementById("preview-message").textContent.includes("unavailable")');
});


test('browser navigation waits for its document and asynchronous intercept completion',async t=>{
 const b=await browser();t.after(()=>b.close());let finished=false;
 b.on('Fetch.requestPaused',async e=>{await b.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<h1>Destination</h1>').toString('base64')});await new Promise(r=>setTimeout(r,150));finished=true;});
 await b.send('Fetch.enable',{patterns:[{urlPattern:'https://site-studio.invalid/*',requestStage:'Request'}]});
 await b.navigate('https://site-studio.invalid/destination');assert.equal(await b.evaluate('document.querySelector("h1")?.textContent'),'Destination');assert.equal(finished,true,'navigation must await asynchronous interception handlers');
});
