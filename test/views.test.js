'use strict';
const {childEnv:osChildEnv}=require('./helpers');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {fixture,textOp}=require('./helpers');
const {createStore}=require('../src/studio-store');
const cli=path.join(__dirname,'../tools/site-studio-view.js');
function run(o,view='home',extra=[]){return spawnSync(process.execPath,[cli,view,'--site',o.sourceRoot,'--data-dir',o.dataRoot,'--json',...extra],{encoding:'utf8',timeout:process.platform==='win32'?30000:5000,env:osChildEnv()});}
function good(o,view,extra){const p=run(o,view,extra);assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
test('views read live and stopped working copies without writing or taking a lease',t=>{
 const o=fixture(t),store=createStore(o);t.after(()=>store.close());store.edit(textOp(store.model));store.checkpoint('First',1);
 const before=fs.readFileSync(path.join(o.dataRoot,'state.json')),lease=fs.readFileSync(path.join(o.dataRoot,'lease.json')),names=fs.readdirSync(o.dataRoot);
 const home=good(o);assert.equal(home.rev,1);assert.match(home.rows.join('\n'),/4 files/);assert.match(home.rows.join('\n'),/Editing enabled/);
 assert(good(o,'pages').rows.some(r=>r.includes('index.html')));assert(good(o,'checkpoints').rows.some(r=>r.includes('First')));
 assert(good(o,'history').rows.some(r=>r.includes('Updated text')));
 assert.deepEqual(fs.readFileSync(path.join(o.dataRoot,'state.json')),before);assert.deepEqual(fs.readFileSync(path.join(o.dataRoot,'lease.json')),lease);assert.deepEqual(fs.readdirSync(o.dataRoot),names);
 store.close();good(o);assert(!fs.existsSync(path.join(o.dataRoot,'lease.json')));
});
test('paging pins the whole snapshot including same-revision pause and checkpoint writes',t=>{
 const o=fixture(t),store=createStore(o);t.after(()=>store.close());for(let i=0;i<18;i++)store.edit(textOp(store.model,'Edit '+i));
 const first=good(o,'history');assert.equal(first.rows.length,8);assert.equal(first.nextOffset,8);
 const next=good(o,'history',['--offset','8','--snapshot',first.snapshot]);assert.equal(next.offset,8);assert.notDeepEqual(first.rows,next.rows);
 store.human('pause',{expectedRev:18});const stale=run(o,'history',['--offset','8','--snapshot',first.snapshot]);assert.equal(stale.status,1);assert.match(stale.stderr,/VIEW_CHANGED/);
 assert.equal(run(o,'history',['--offset','8']).status,1);assert.equal(run(o,'history',['--offset','999','--snapshot',good(o).snapshot]).status,1);
});
test('views refuse missing configuration, wrong bindings, linked and oversized state, without creating files',t=>{
 const o=fixture(t);assert.equal(run(o).status,0);assert(!fs.existsSync(o.dataRoot));
 const missing=spawnSync(process.execPath,[cli,'home','--data-dir',''],{encoding:'utf8',env:{},timeout:process.platform==='win32'?30000:5000});assert.equal(missing.status,1);assert.match(missing.stderr,/VIEW_CONFIG/);
 const store=createStore(o);store.close();const file=path.join(o.dataRoot,'state.json'),state=fs.readFileSync(file);let data=JSON.parse(state);data.sourceRoot=o.root;fs.writeFileSync(file,JSON.stringify(data));assert.match(run(o).stderr,/VIEW_BINDING/);
 fs.unlinkSync(file);const target=path.join(o.root,'target.json');fs.writeFileSync(target,state);fs.linkSync(target,file);assert.match(run(o).stderr,/VIEW_STATE/);fs.unlinkSync(file);
 fs.writeFileSync(file,'');fs.truncateSync(file,128*1024*1024+1);assert.match(run(o).stderr,/VIEW_STATE/);
});

test('views refuse a file symlink when the account can create that fixture',t=>{
 const o=fixture(t),store=createStore(o);store.close();
 const file=path.join(o.dataRoot,'state.json'),state=fs.readFileSync(file),target=path.join(o.root,'target.json');
 fs.unlinkSync(file);fs.writeFileSync(target,state);
 try{fs.symlinkSync(target,file);}catch(error){
  if(process.platform==='win32'&&error.code==='EPERM'){t.skip('Actual Windows file-symlink creation refused EPERM under this token; leaf refusal is not qualified');return;}
  throw error;
 }
 const result=run(o);assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/VIEW_STATE/);
 assert.deepEqual(fs.readFileSync(target),state);
});
test('Windows views refuse a real directory junction without changing private saved state',{skip:process.platform!=='win32'},t=>{
 const o=fixture(t),store=createStore(o);store.close();
 const file=path.join(o.dataRoot,'state.json'),before=fs.readFileSync(file),names=fs.readdirSync(o.dataRoot),junction=path.join(o.root,'junction-state');
 fs.symlinkSync(o.dataRoot,junction,'junction');assert.equal(fs.lstatSync(junction).isSymbolicLink(),true);
 const result=run({...o,dataRoot:junction});assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/VIEW_STATE/);
 assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readdirSync(o.dataRoot),names);
});
test('view output sanitizes terminal controls and never exposes source, capability fields or arbitrary errors',t=>{
 const o=fixture(t),store=createStore(o);store.close();const file=path.join(o.dataRoot,'state.json'),s=JSON.parse(fs.readFileSync(file));
 s.launchSecret='SECRET_SENTINEL';s.model.files[0].source+='SECRET_SOURCE';s.history[0].summary='bad\x1b]52;c;hidden\x07\r\n\u202e\u200b text';s.history[0].label='x'.repeat(100000);fs.writeFileSync(file,JSON.stringify(s));
 const output=run(o,'history');assert.equal(output.status,0,output.stderr);const page=JSON.parse(output.stdout);assert(page.rows[0].length<600);assert(!/[\x00-\x1f\x7f-\x9f\u202e\u200b]/.test(page.rows[0]));assert(!output.stdout.includes('SECRET'));
 assert(good(o,'preview').rows.join(' ').includes('human'));assert(good(o,'export').rows.join(' ').includes('Confirm'));
});
test('view input is bounded, strictly parsed and shell metacharacters remain literal',t=>{
 const o=fixture(t),store=createStore(o);store.close();
 for(const extra of [['--offset','1e2'],['--offset','-1'],['--snapshot','x'],['--unknown','yes'],['--site','~/site']])assert.equal(run(o,'pages',extra).status,1);
 assert.equal(run(o,'export; touch owned').status,1);assert(!fs.existsSync(path.join(o.root,'owned')));
});
test('help works before configuration and terminal sanitization covers Unicode format controls',async()=>{
 const p=spawnSync(process.execPath,[cli,'help'],{encoding:'utf8',env:{},timeout:process.platform==='win32'?30000:5000});assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/site-studio home/);assert.match(p.stdout,/Next page/);
 const {safeText}=await import('../hooks/view-contract.mjs');
 for(let n=0;n<=0x10ffff;n++){
  const c=String.fromCodePoint(n);if(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]/u.test(c))assert.equal(safeText(c),'�','U+'+n.toString(16));
 }
});

test('help performs no path, native identity or filesystem metadata work before configuration',async()=>{
 // Warm both loaders before installing traps: module acquisition is not the
 // runtime path-resolution behaviour this check is intended to measure.
 const {view}=require('../src/site-view');
 await import('../hooks/view-contract.mjs');
 const native=require('../src/native-filesystem'),calls=[],restore=[];
 const trap=name=>()=>{calls.push(name);throw Error('Unexpected help effect: '+name);};
 const patch=(object,key,label)=>{const descriptor=Object.getOwnPropertyDescriptor(object,key);assert.equal(typeof descriptor.value,'function');Object.defineProperty(object,key,{...descriptor,value:trap(label)});restore.push(()=>Object.defineProperty(object,key,descriptor));};
 const options={view:'help'};
 for(const key of ['sourceRoot','dataRoot','exportRoot'])Object.defineProperty(options,key,{get:trap('options.'+key)});
 let page;
 try{
  for(const key of ['defaultDataRoot','windowsIdentity','privateDirectory','inspectWindowsPath'])patch(native,key,'native.'+key);
  for(const key of ['statSync','lstatSync','realpathSync','accessSync','existsSync','openSync','readFileSync','readdirSync'])patch(fs,key,'fs.'+key);
  page=await view(options);
 }finally{for(const undo of restore.reverse())undo();}
 assert.deepEqual(calls,[]);
 assert.equal(page.schema,'site-studio/view/1');assert.equal(page.view,'help');assert.equal(page.rev,0);
 assert(page.rows.join('\n').includes('site-studio home'));assert.equal(page.offset,0);assert.equal(page.limit,8);
});
