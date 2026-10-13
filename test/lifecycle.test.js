'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture,saveEvidence}=require('./helpers');const {start,runOnce}=require('./mcp-helper');
test('stdio golden tools/list and two-page edit checkpoint undo export lifecycle',async t=>{
  const o=fixture(t),original=fs.readFileSync(path.join(o.sourceRoot,'index.html')),child=start(o);t.after(()=>child.stop());
  const initialized=await child.init();assert.equal(initialized.result.serverInfo.name,'toolsenabled-site-studio');assert.equal(initialized.result.serverInfo.version,'0.1.4');assert.equal(require('../package.json').version,'0.1.4');assert.equal(require('../.codex-plugin/plugin.json').version,'0.1.4');
  const list=await child.rpc('tools/list');assert.deepEqual(list.result.tools,JSON.parse(fs.readFileSync(path.join(__dirname,'tools-list.golden.json'))));assert(!list.result.tools.some(t=>/undo|pause|redo|export|restore/.test(t.name)));
  let pages=await child.tool('web_pages');assert.equal(pages.files.filter(f=>f.kind==='html').length,2);
  async function edit(name,make){pages=await child.tool('web_pages');const f=pages.files.find(f=>f.path==='index.html');return child.tool(name,{expected_rev:pages.rev,...make(f,pages)});}
  await edit('web_set_text',f=>({file_id:f.id,node_id:f.nodes.find(n=>n.selectorHint==='h1').id,text:'Designed <&> $1'}));
  await edit('web_set_attr',f=>({file_id:f.id,node_id:f.nodes.find(n=>n.selectorHint==='h1').id,name:'class',value:'hero'}));
  await edit('web_css_set',(f,p)=>({file_id:p.files.find(f=>f.kind==='css').id,selector:'.hero',declarations:'color: teal; margin: 0;'}));
  await edit('web_insert_section',f=>({file_id:f.id,parent_id:f.nodes.find(n=>n.selectorHint==='main').id,position:'last',html:'<section><h2>Crafted</h2><p>A new section.</p></section>'}));
  await edit('web_draw',()=>({path:'art/mark.svg',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="teal"/></svg>'}));
  assert.equal((await child.tool('web_pages')).rev,5);await child.tool('web_checkpoint',{label:'Designed',expected_rev:5});
  await edit('web_set_text',f=>({file_id:f.id,node_id:f.nodes.find(n=>n.selectorHint==='h1').id,text:'Discard me'}));
  const preview=await child.tool('web_preview');const launchUrl=child.stderr.match(/http:\/\/127\.0\.0\.1:\d+\/open#cap=[a-f0-9]+/)[0];const {token}=await require('./session-helper').openSession(launchUrl);
  assert(!JSON.stringify(child.output).includes(new URL(launchUrl).hash.slice(5)));assert(!JSON.stringify(child.output).includes(token),'human token never appears in MCP');
  async function human(action,args){const res=await fetch(preview.url+'/api/control',{method:'POST',headers:{Origin:preview.url,'content-type':'application/json','x-site-studio-control':token},body:JSON.stringify({action,...args})});const result=await res.json();assert.equal(res.status,200,JSON.stringify(result));return result;}
  await human('undo',{expectedRev:6});assert.equal((await child.tool('web_pages')).rev,7);
  const status=await (await fetch(preview.url+'/api/status',{headers:{'x-site-studio-control':token}})).json();const session=await require('./session-helper').issuePreview(preview.url,{'x-site-studio-control':token});const live=await (await fetch(session.url+'/index.html',{headers:session.headers})).text();assert.match(live,/Designed &lt;&amp;&gt; \$1/);assert.match(live,/<h2>Crafted<\/h2>/);assert.match(live,/class="hero"/);assert.deepEqual(fs.readFileSync(path.join(o.sourceRoot,'index.html')),original);
  const receipt=await human('export',{expectedRev:7,confirmed:true});assert.equal(receipt.files,5);assert.equal(fs.readFileSync(path.join(o.exportRoot,'index.html'),'utf8'),(await child.tool('web_read',{file_id:(await child.tool('web_pages')).files.find(f=>f.path==='index.html').id})).source);assert.match(fs.readFileSync(path.join(o.exportRoot,'styles.css'),'utf8'),/color: teal/);assert.match(fs.readFileSync(path.join(o.exportRoot,'art/mark.svg'),'utf8'),/circle/);assert.equal(fs.readFileSync(path.join(o.exportRoot,'nested/about.html'),'utf8'),fs.readFileSync(path.join(o.sourceRoot,'nested/about.html'),'utf8'));assert.deepEqual(fs.readFileSync(path.join(o.exportRoot,'nested/pixel.png')),fs.readFileSync(path.join(o.sourceRoot,'nested/pixel.png')));
  await human('restore',{expectedRev:7,label:'Designed'});assert.equal((await child.tool('web_pages')).rev,8);
  assert.deepEqual(await child.stop(),{code:0,signal:null});assert.equal(fs.existsSync(path.join(o.dataRoot,'lease.json')),false);for(const url of [preview.url,preview.site_url]){const probe=require('node:net').createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(Number(new URL(url).port),'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));}
  const next=start(o);t.after(()=>next.stop());await next.init();assert.equal((await next.tool('web_pages')).rev,8);assert.deepEqual(await next.stop(),{code:0,signal:null});
  await saveEvidence(e=>{e.copy('lifecycle/original',o.sourceRoot);e.copy('lifecycle/export',o.exportRoot);const crypto=require('node:crypto');const hashes={};for(const rel of ['index.html','styles.css','nested/about.html','nested/pixel.png','art/mark.svg'])hashes[rel]=crypto.createHash('sha256').update(fs.readFileSync(path.join(o.exportRoot,rel))).digest('hex');e.write('lifecycle/receipt.json',JSON.stringify({ok:true,tools:list.result.tools.length,pages:2,edits:['text','attribute','CSS','section','SVG'],checkpoint:'Designed',exportRevision:7,restoredAndRestartedRevision:8,originalUnchanged:true,binaryPreserved:true,exitCode:0,leaseReleased:true,bothPortsRebound:true,dashboardSessionRequired:true,sha256:hashes},null,2)+'\n');e.write('lifecycle/mcp-responses.json',JSON.stringify(child.output,null,2)+'\n');});

});
test('stdio validates protocol and tool arguments, refuses stale edits and settles EOF',async t=>{
 const o=fixture(t),c=start(o);t.after(()=>c.stop());assert.equal((await c.rpc('tools/list')).error.code,-32002);await c.init();assert.deepEqual((await c.rpc('ping')).result,{});assert.equal((await c.rpc('not/a/method')).error.code,-32601);const p=await c.tool('web_pages');const f=p.files.find(f=>f.path==='index.html'),node_id=f.nodes.find(n=>n.selectorHint==='h1').id;
 for(const args of [{file_id:f.id,node_id,text:'x'},{file_id:f.id,node_id,text:1,expected_rev:0},{file_id:f.id,node_id,text:'x',expected_rev:0,other:1},{file_id:f.id,node_id,text:'x',expected_rev:-1}])assert.equal((await c.rpc('tools/call',{name:'web_set_text',arguments:args})).result.isError,true);
 const results=await Promise.all([c.rpc('tools/call',{name:'web_set_text',arguments:{file_id:f.id,node_id,text:'one',expected_rev:0}}),c.rpc('tools/call',{name:'web_set_text',arguments:{file_id:f.id,node_id,text:'two',expected_rev:0}})]);assert.equal(results.filter(r=>r.result.isError).length,1);assert.equal((await c.tool('web_pages')).rev,1);
 for(const name of ['web_undo','web_export','web_pause'])assert.equal((await c.rpc('tools/call',{name,arguments:{confirmed:true}})).result.isError,true);
 assert.equal((await c.rpc('tools/call',{name:'web_read',arguments:{file_id:p.files.find(f=>f.kind==='asset').id}})).result.isError,true);
 const calls=Array.from({length:10},()=>c.rpc('tools/call',{name:'web_timeline',arguments:{}}));const end=c.stop();await Promise.all(calls);assert.deepEqual(await end,{code:0,signal:null});
});
test('actual MCP/MCP and browser/MCP process contention, signals release lease',async t=>{
 for(const entry of ['mcp-web.js','web-server.js']){const o=fixture(t);const first=start(o,entry);t.after(()=>first.stop());if(entry==='mcp-web.js')await first.init();else {for(let i=0;i<100&&!first.stderr.includes('http://');i++)await new Promise(r=>setTimeout(r,10));assert.match(first.stderr,/http:\/\//);}
 const second=start(o);const result=await second.exited;assert.equal(result.code,1);assert.match(second.stderr,/lease/);first.child.kill('SIGTERM');assert.deepEqual(await first.exited,{code:0,signal:null});assert.equal(fs.existsSync(path.join(o.dataRoot,'lease.json')),false);const third=start(o);await third.init();await third.stop();}
});

test('a killed MCP owner is recovered automatically with its saved state',async t=>{
 const o=fixture(t),first=start(o);await first.init();await first.tool('web_checkpoint',{label:'Before crash',expected_rev:0});
 const file=path.join(o.dataRoot,'lease.json'),lease=JSON.parse(fs.readFileSync(file));
 first.child.kill('SIGKILL');await first.exited;
 const run=runOnce(o,JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'recovery-test',version:'1'}}})+'\n');
 assert.equal(run.status,0,run.stderr);assert.match(run.stderr,/Recovered stale Site Studio state lease/);
 assert.equal(typeof lease.process.startTime,'string');assert(lease.process.startTime);assert.equal(lease.pid,first.child.pid);
 assert(JSON.parse(fs.readFileSync(path.join(o.dataRoot,'state.json'))).checkpoints.some(c=>c.label==='Before crash'));
 assert(!fs.existsSync(file));
});

test('a live lease owner is preserved and a reused PID does not retain its lease',async t=>{
 const o=fixture(t),first=start(o);t.after(()=>first.stop());await first.init();const file=path.join(o.dataRoot,'lease.json'),before=fs.readFileSync(file);
 const second=start(o);assert.equal((await second.exited).code,1);assert.match(second.stderr,/lease.*alive/i);assert.deepEqual(fs.readFileSync(file),before);
 first.child.kill('SIGKILL');await first.exited;
 const stale=JSON.parse(before);stale.pid=process.pid;fs.writeFileSync(file,JSON.stringify(stale));
 const replacement=start(o);t.after(()=>replacement.stop());await replacement.init();assert.match(replacement.stderr,/Recovered stale Site Studio state lease/);assert.equal(JSON.parse(fs.readFileSync(file)).pid,replacement.child.pid);
 await replacement.stop();
});

test('concurrent restarts recover one stale owner without admitting a second writer',async t=>{
 const o=fixture(t),first=start(o);await first.init();first.child.kill('SIGKILL');await first.exited;
 const clients=Array.from({length:4},()=>start(o));t.after(()=>Promise.all(clients.map(c=>c.stop())));
 const requests=clients.map(c=>c.init().then(()=>c).catch(()=>null));
 const winner=await Promise.any(requests.map(p=>p.then(c=>{if(!c)throw Error('refused');return c;})));
 await new Promise(r=>setTimeout(r,250));
 assert.equal(clients.filter(c=>c.child.exitCode===null&&c.child.signalCode===null).length,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(o.dataRoot,'lease.json'))).pid,winner.child.pid);
 await winner.tool('web_checkpoint',{label:'Only writer',expected_rev:0});await winner.stop();
 await Promise.all(requests);assert(!fs.existsSync(path.join(o.dataRoot,'lease.json')));
});

test('recovery survives an abandoned recovery claim and handles a prior-boot identity',async t=>{
 const o=fixture(t),first=start(o);await first.init();first.child.kill('SIGKILL');await first.exited;
 const file=path.join(o.dataRoot,'lease.json'),stale=JSON.parse(fs.readFileSync(file));
 fs.writeFileSync(path.join(o.dataRoot,'.lease-recovery-'+stale.nonce),JSON.stringify({...stale,nonce:'a'.repeat(32)}));
 const next=start(o);t.after(()=>next.stop());await next.init();await next.stop();assert(!fs.readdirSync(o.dataRoot).some(n=>n.startsWith('.lease-')));
 if(process.platform==='linux'){
  const identity=require('../src/state-lease').processIdentity(process.pid);
  fs.writeFileSync(file,JSON.stringify({...stale,pid:process.pid,process:{...identity,bootId:'a different boot'}}));
  const reboot=start(o);t.after(()=>reboot.stop());await reboot.init();assert.match(reboot.stderr,/Recovered stale/);await reboot.stop();
 }
 fs.writeFileSync(file,JSON.stringify({pid:stale.pid,nonce:stale.nonce,entry:'site-studio'}));
 const legacy=start(o);assert.equal((await legacy.exited).code,1);assert.match(legacy.stderr,/Cannot verify state lease owner scope/);assert.equal(JSON.parse(fs.readFileSync(file)).pid,stale.pid);
});
