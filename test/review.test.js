'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('CSS read scans a 2 MiB brace-free tail within two seconds',()=>{
  const script=`const {call}=require('./mcp-web');
    const source='h1{color:navy}.hero{margin:0}'+'x'.repeat(2*1024*1024);
    const result=call({model:{rev:0,files:[{id:'css',kind:'css',source}]}},'web_css',{selector:'.hero'});
    require('node:assert/strict').deepEqual(JSON.parse(result.content[0].text).rules,[{file_id:'css',selector:'.hero',declarations:'margin:0'}]);`;
  const r=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),timeout:2000,encoding:'utf8'});
  assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stderr);
});

test('PowerShell registration escapes every single-quote delimiter',()=>{
 const r=spawnSync(process.execPath,['--input-type=module','-e',`Object.defineProperty(process,'platform',{value:'win32'});const {clientConfig}=await import('./tools/mcp-config.mjs');process.stdout.write(clientConfig('codex',{site:"/tmp/Bob‘’‚‛'s site"}));`],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert(r.stdout.includes("Bob‘‘’’‚‚‛‛''s site"),r.stdout);
});

test('closed MCP schemas refuse inherited property names',()=>{
 const {call}=require('../mcp-web');
 for(const key of ['constructor','toString','hasOwnProperty','valueOf','__proto__']){
  const r=call({model:{rev:0,files:[]}},'web_pages',JSON.parse('{"'+key+'":1}'));
  assert.equal(r.isError,true,key);assert.match(r.content[0].text,/unknown argument/);
 }
});

for(const entry of ['mcp-web.js','web-server.js'])test(entry+' releases its lease on terminal hangup',async t=>{
 const fs=require('node:fs');const {fixture}=require('./helpers');const {start}=require('./mcp-helper');const o=fixture(t);const m=start(o,entry);t.after(async()=>{if(m.child.exitCode===null&&m.child.signalCode===null)m.child.kill('SIGKILL');await m.exited;});
 const deadline=Date.now()+5000;while(!m.stderr.includes('dashboard session:')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.match(m.stderr,/dashboard session:/);
 m.child.kill('SIGHUP');assert.deepEqual(await m.exited,{code:0,signal:null});assert(!fs.existsSync(path.join(o.dataRoot,'lease.json')));
 const source=fs.readFileSync(path.join(__dirname,'..',entry),'utf8');assert.match(source,/SIGBREAK/);
});

test('portable paths refuse all Windows console and superscript device names',()=>{
 const {safePath}=require('../src/web-model');
 for(const name of ['COM¹','COM²','COM³','LPT¹','LPT²','LPT³','CONIN$','CONOUT$','CLOCK$'])for(const p of [name,name+'.html','folder/'+name.toLowerCase()+'.svg',name+'/index.html'])assert.equal(safePath(p),false,p);
});

test('path components use a UTF-8 byte bound and filesystem errors omit private paths',()=>{
 const {safePath}=require('../src/web-model');const {call}=require('../mcp-web');
 assert.equal(safePath('€'.repeat(100)+'.html'),false);assert.equal(safePath('€'.repeat(80)+'.html'),true);
 const app={model:{rev:0,files:[]},edit(){throw Object.assign(Error('EACCES: /private/person/state/working'),{code:'EACCES',path:'/private/person/state/working'});}};
 const r=call(app,'web_add_page',{path:'ok.html',title:'OK',expected_rev:0});assert.equal(r.isError,true);assert.match(r.content[0].text,/filesystem refused \(EACCES\)/);assert.doesNotMatch(r.content[0].text,/private|person|working/);
});

test('oversize stdio frames refuse one message and preserve subsequent requests',async t=>{
 const {start}=require('./mcp-helper');const {fixture}=require('./helpers');const m=start(fixture(t));t.after(()=>m.stop());await m.init();
 m.child.stdin.write('{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"padding":"'+'x'.repeat(300000)+'"}}\n');
 assert.deepEqual((await m.rpc('ping')).result,{});assert(m.output.some(r=>r.id===99&&r.error));
 m.child.stdin.write('x'.repeat(300000));await new Promise(r=>setTimeout(r,30));m.child.stdin.write('\n');assert.deepEqual((await m.rpc('ping')).result,{});
 const {TOOLS}=require('../src/tools-definitions');for(const tool of TOOLS){const args={};for(const [key,p] of Object.entries(tool.inputSchema.properties))if(p.type==='string'){assert(p.maxLength);args[key]='\u0001'.repeat(p.maxLength);}else args[key]=1;assert(Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:tool.name,arguments:args}}))<262144,tool.name);}
});

test('fingerprints have a locale-independent total order and portable collision keys',()=>{
 const {fingerprint}=require('../src/web-import');const {validateModel,safePath}=require('../src/web-model');
 const files=['ab.html','a\u00adb.html'].map((path,i)=>({id:String(i),path,kind:'html',source:'<h1>Hi</h1>',nodes:[]}));
 assert.equal(fingerprint({files}),fingerprint({files:[...files].reverse()}));
 for(const name of ['a\u00adb.html','a\u0085b.html','a\ufe0fb.html','a\u034fb.html'])assert.equal(safePath(name),false,name);
 for(const [a,b] of [['é.html','e\u0301.html'],['Straße.html','STRASSE.html'],['ς.html','σ.html'],['ﬃ.html','FFI.html'],['Ꭰ.html','ꭰ.html']]){
  assert.throws(()=>validateModel({rev:0,root:'site',files:[{...files[0],path:a},{...files[1],path:b}]}),/invalid file|collision/);
  assert.throws(()=>validateModel({rev:0,root:'site',directories:[a,b],files:[]}),/collision/);
 }
});

test('saved fingerprints migrate across locales without accepting original drift',async t=>{
 const fs=require('node:fs');const {fixture}=require('./helpers');const {createStore}=require('../src/studio-store');const {hash}=require('../src/web-model');const {allDirectories,bytes,fingerprint}=require('../src/web-import');
 const o=fixture(t);for(const name of ['aarhus.html','zebra.html'])fs.writeFileSync(path.join(o.sourceRoot,name),'<h1>City</h1>');
 let app=createStore(o);const baseline=app.model;app.close();const stateFile=path.join(o.dataRoot,'state.json');let state=JSON.parse(fs.readFileSync(stateFile));
 state.version=1;delete state.fingerprintVersion;state.originalFingerprint=hash(JSON.stringify({directories:allDirectories(baseline),files:baseline.files.map(f=>[f.path,hash(bytes(f))]).sort((a,b)=>a[0].localeCompare(b[0],'da'))}));fs.writeFileSync(stateFile,JSON.stringify(state));
 app=createStore(o);assert.equal(JSON.parse(fs.readFileSync(stateFile)).originalFingerprint,fingerprint(baseline));app.human('export',{expectedRev:0,confirmed:true});app.close();
 fs.writeFileSync(stateFile,JSON.stringify(state));fs.writeFileSync(path.join(o.sourceRoot,'index.html'),'<h1>External drift</h1>');
 app=createStore(o);assert.throws(()=>app.human('export',{expectedRev:0,confirmed:true}),/drift/);app.close();
});

test('preview drafts need a separate read capability and controller aliases refuse',async t=>{
 const {fixture,textOp}=require('./helpers');const {createCoordinator}=require('../web-server');const {openSession}=require('./session-helper');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();app.edit(textOp(app.model,'Private draft'));
 for(const url of [app.siteUrl+'/',app.siteUrl+'/index.html',app.previewUrl+'/site/index.html'])assert.equal((await fetch(url)).status,403,url);
 const {headers}=await openSession(app.launchUrl);const status=await (await fetch(app.previewUrl+'/api/status',{headers})).json();assert.match(status.previewUrl,/\/view\/[a-f0-9]{64}$/);
 const page=await fetch(status.previewUrl+'/index.html');assert.equal(page.status,200);assert.match(await page.text(),/Private draft/);assert.equal((await fetch(status.previewUrl.replace(/.$/,'x')+'/index.html')).status,403);
});

test('capability previews rewrite local HTML and CSS references without changing exports',()=>{
 const {previewBytes}=require('../src/preview-content');const prefix='/view/private';
 const css='@import "/base.css";/* url(/ignored.png) */.hero{background:url(../art/a.png)}@font-face{src:url("/fonts/a.woff")}';
 const file={kind:'css',path:'nested/styles.css',source:css};const out=previewBytes(file,prefix).toString();assert.match(out,/@import "\/view\/private\/base.css"/);assert.match(out,/url\(\/view\/private\/art\/a.png\)/);assert.match(out,/url\("\/view\/private\/fonts\/a.woff"\)/);assert.equal(file.source,css);
 const html={kind:'html',path:'nested/index.html',source:'<base href="/wrong/"><style>body{background:url(/art/a.png)}</style><a href="../../index.html">Home</a><img srcset="/art/a.png 1x, ../art/b.png 2x">'};
 const page=previewBytes(html,prefix).toString();assert(!page.includes('<base'));assert.match(page,/href="\/view\/private\/index.html"/);assert.match(page,/url\(\/view\/private\/art\/a.png\)/);assert.match(page,/srcset="\/view\/private\/art\/a.png 1x, \/view\/private\/art\/b.png 2x"/);
});

test('preview reads use an immutable snapshot and partial headers expire promptly',async t=>{
 const {fixture}=require('./helpers');const {createCoordinator}=require('../web-server');const {previewBase}=require('./session-helper');const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const base=await previewBase(app);
 const clone=global.structuredClone;let clones=0;global.structuredClone=(...args)=>{clones++;return clone(...args);};try{for(const route of ['/index.html','/missing.html'])await (await fetch(base+route)).arrayBuffer();assert.equal(clones,0);}finally{global.structuredClone=clone;}
 assert.equal(app.previewServer.maxConnections,undefined);assert.equal(app.previewServer.timeout,2000);assert(app.previewServer.connectionsCheckingInterval<=250);
 const net=require('node:net');const socket=net.createConnection({host:'127.0.0.1',port:new URL(app.siteUrl).port});t.after(()=>socket.destroy());socket.on('error',()=>{});socket.resume();const start=Date.now();socket.write('GET / HTTP/1.1\r\nHost:');
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('partial header socket exceeded four seconds')),4000);socket.once('close',()=>{clearTimeout(timer);resolve();});});assert(Date.now()-start<4000);
});

test('history distinguishes actors and protects the opened r0 restore target',async t=>{
 const {fixture,textOp}=require('./helpers');const {createStore}=require('../src/studio-store');const o=fixture(t);let app=createStore(o);t.after(()=>app.close());
 for(const label of ['Undid last edit','Original site (revision 0)','Opened working copy (r0)','x\u202Ey','x\nnext'])assert.throws(()=>app.checkpoint(label,0),/label/);
 const initial=app.status.checkpoints.find(c=>c.permanent);assert.equal(initial.label,'Opened working copy (r0)');assert.equal(initial.actor,'system');
 app.edit(textOp(app.model));app.checkpoint('Agent note',1);assert.deepEqual({...app.status.history.at(-1)},{rev:1,actor:'agent',type:'checkpoint',summary:'Saved checkpoint',label:'Agent note'});
 app.human('checkpoint',{expectedRev:1,label:'Human review'});assert.equal(app.status.history.at(-1).actor,'human');assert.equal(app.status.checkpoints.find(c=>c.label==='Human review').actor,'human');
 assert.throws(()=>app.human('delete_checkpoint',{expectedRev:1,label:initial.label}),/permanent/);
 for(let i=0;i<23;i++)app.edit(textOp(app.model,'Edit '+i));app.close();app=createStore(o);app.human('restore',{expectedRev:24,label:initial.label});assert.match(app.model.files.find(f=>f.path==='index.html').source,/>Home</);assert.equal(app.model.rev,25);assert.equal(app.status.history.at(-1).actor,'human');assert.equal(app.status.history.at(-1).summary,'Restored checkpoint');
});

test('release layout includes source, tests, design, license and changelog',()=>{
 const fs=require('node:fs');const root=path.join(__dirname,'..');for(const name of ['src/studio-store.js','test/lifecycle.test.js','tools/run-tests.js','docs/DESIGN.md','LICENSE','CHANGELOG.md'])assert(fs.existsSync(path.join(root,name)),name);
 for(const name of ['studio-store.js','run-tests.js','DESIGN.md','tests'])assert(!fs.existsSync(path.join(root,name)),name);
});

test('public tool descriptions state revision and external-reference policy accurately',()=>{
 const {TOOLS}=require('../src/tools-definitions');assert.match(TOOLS.find(t=>t.name==='web_draw').description,/--allow-external/);assert.doesNotMatch(TOOLS.find(t=>t.name==='web_set_text').description,/hash/);assert.match(TOOLS.find(t=>t.name==='web_set_text').description,/expected_rev/);assert.doesNotMatch(require('../.codex-plugin/plugin.json').interface.shortDescription,/safe/i);
});
