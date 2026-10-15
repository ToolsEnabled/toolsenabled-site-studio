'use strict';
const {childEnv:osChildEnv}=require('./helpers');
const {privateMkdir,privateWrite,publicReadFixture}=require('./helpers');
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {fixture,textOp}=require('./helpers');
const {createStore}=require('../src/studio-store'),{view}=require('../src/site-view');
const root=path.join(__dirname,'..');

// Compare names, type, permissions, file bytes and write/change times; access times may change on reads.
function tree(root){
 const out=[];
 function visit(dir){for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),s=fs.lstatSync(file);
  out.push([path.relative(root,file),s.mode,s.size,s.mtimeMs,s.ctimeMs,
   s.isSymbolicLink()?fs.readlinkSync(file):s.isFile()?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null]);
  if(s.isDirectory())visit(file);
 }}
 visit(root);return out;
}
async function doctor(o){
 let page=await view({...o,view:'doctor'}),rows=[...page.rows];
 while(page.nextOffset!==null){page=await view({...o,view:'doctor',offset:page.nextOffset,snapshot:page.snapshot});rows.push(...page.rows);}
 return rows.join('\n');
}
function aliases(source){return [source,source+path.sep,source+path.sep+'.',source+path.sep+'nested'+path.sep+'..'];}
function child(script,args,env){
 const r=spawnSync(process.execPath,['-e',script,...args],{encoding:'utf8',timeout:process.platform==='win32'?30000:10000,
  env:{...osChildEnv(),...env}});
 assert.equal(r.status,0,r.stderr);assert.equal(r.signal,null);return r.stdout;
}
for(const mode of ['option','environment'])test('F6 '+(process.platform==='win32'?'explicit native':'default')+' view and runtime share persisted state for '+mode+' path aliases',t=>{
 const o=fixture(t),home=path.join(o.root,'home');fs.mkdirSync(home,{mode:0o700});
 const env={HOME:home},storePath=path.join(root,'src/studio-store.js'),viewPath=path.join(root,'src/site-view.js');
 const config=source=>({...((mode==='option')?{sourceRoot:source}:{}),...(process.platform==='win32'?{dataRoot:o.dataRoot}:{})});
 const childEnv=source=>({...env,...(mode==='environment'?{SITE_STUDIO_ROOT:source}:{})});
 const started=child("const s=require(process.argv[1]).createStore(JSON.parse(process.argv[2]));s.human('pause',{expectedRev:0});s.close();console.log('runtime persisted');",
  [storePath,JSON.stringify(config(o.sourceRoot+path.sep))],childEnv(o.sourceRoot+path.sep));
 assert.equal(started.trim(),'runtime persisted');
 const before=tree(home);
 for(const source of aliases(o.sourceRoot)){
  const page=JSON.parse(child("require(process.argv[1]).view({...JSON.parse(process.argv[2]),view:'home'}).then(p=>console.log(JSON.stringify(p))).catch(e=>{console.error(e.message);process.exitCode=1;});",
   [viewPath,JSON.stringify(config(source))],childEnv(source)));
  assert(page.rows.some(row=>row.includes('Editing paused')),'must find the runtime-persisted paused state for '+mode+' alias');
  assert.equal(page.rev,0);
 }
 assert.deepEqual(tree(home),before,'views must not create alias state or acquire a lease');
});

test('F8 unopened doctor agrees with runtime for equivalent original export and sibling state aliases',async t=>{
 for(const variant of ['source separator','source dot','state sibling']){
  const o=fixture(t),config={...o,exportRoot:o.sourceRoot};
  if(variant==='source separator')config.sourceRoot+=path.sep;
  if(variant==='source dot')config.sourceRoot+=path.sep+'.';
  if(variant==='state sibling')config.dataRoot=o.sourceRoot+path.sep+'..'+path.sep+'state';
  const before=tree(o.root),text=await doctor(config);
  assert(text.includes('Configured folder separation: valid.'),variant+' should be accepted like runtime');
  assert(!text.includes('Startup blocked: configured folders overlap.'),variant);
  assert(!text.includes(o.root),'do not disclose absolute configured paths');
  assert.deepEqual(tree(o.root),before,'doctor must not change unopened folders');
  const store=createStore(config);assert.equal(store.model.rev,0);store.close();
 }
});

test('F8 doctor names nonempty refusal and preserves unrelated content as runtime refuses',async t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});
 const file=path.join(o.dataRoot,'unrelated-private-name');privateWrite(file,'fixture content',{mode:0o600});
 const before=tree(o.root),text=await doctor(o);
 assert(text.includes('Startup blocked: state folder is non-empty; use a dedicated empty folder.'));
 assert(!text.includes('unrelated-private-name'));assert(!text.includes('fixture content'));assert(!text.includes(o.root));
 assert.deepEqual(tree(o.root),before,'doctor must not touch a nonempty state folder');
 assert.throws(()=>createStore(o),/state root must be an empty dedicated directory/);
 assert.equal(fs.readFileSync(file,'utf8'),'fixture content');assert(!fs.existsSync(path.join(o.dataRoot,'state.json')));
});

test('F8 doctor distinguishes permitted metadata from an unverifiable primary lease without repair',async t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});
 const claim=path.join(o.dataRoot,'.lease-recovery-'+'a'.repeat(32));privateWrite(claim,'not an owner record',{mode:0o600});
 let before=tree(o.root),text=await doctor(o);
 assert(text.includes('dedicated empty folder'));assert(text.includes('Lease metadata files: 1'));assert(text.includes('Server lease: absent'));
 assert(!text.includes('not an owner record'));assert.deepEqual(tree(o.root),before);
 const store=createStore(o);store.close();assert.equal(fs.readFileSync(claim,'utf8'),'not an owner record');
 const unopened=fixture(t);privateMkdir(unopened.dataRoot,{mode:0o700});
 privateWrite(path.join(unopened.dataRoot,'lease.json'),'{}',{mode:0o600});
 before=tree(unopened.root);text=await doctor(unopened);
 assert(text.includes('Server lease: unverifiable'));assert(text.includes('No repair is performed.'));
 assert.deepEqual(tree(unopened.root),before);assert.throws(()=>createStore(unopened),/Cannot read state lease safely/);
 assert.equal(fs.readFileSync(path.join(unopened.dataRoot,'lease.json'),'utf8'),'{}');
});

test('F8 doctor names permission refusal and missing source/export parents without creating them',async t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});publicReadFixture(o.dataRoot);
 let before=tree(o.root),text=await doctor(o);
 assert(text.includes(process.platform==='win32'?'State folder: inaccessible or linked':'private permissions required (0700)'));assert.deepEqual(tree(o.root),before);
 assert.throws(()=>createStore(o),process.platform==='win32'?/Windows private-folder check failed/:/state root must have private permissions/);
 const bad={...o,sourceRoot:path.join(o.root,'absent-site'),dataRoot:path.join(o.root,'absent-state'),exportRoot:path.join(o.root,'absent-parent','export')};
 before=tree(o.root);text=await doctor(bad);
 assert(text.includes('Site folder: missing or inaccessible'));assert(text.includes('Export parent: missing or inaccessible'));
 assert.deepEqual(tree(o.root),before);
 assert.throws(()=>createStore(bad),{code:'ENOENT'});
});

test('F8 doctor and runtime reject actual state/source, state/export and installation overlaps',async t=>{
 for(const variant of ['source/state','state/export','installation']){
  const o=fixture(t),config={...o};
  if(variant==='source/state')config.dataRoot=o.sourceRoot+path.sep+'nested'+path.sep+'..';
  if(variant==='state/export')config.exportRoot=config.dataRoot+path.sep+'.';
  if(variant==='installation')config.exportRoot=path.join(root,'site','new-export');
  const before=tree(o.root),text=await doctor(config);
  assert(text.includes('Startup blocked: configured folders overlap.'),variant+' must name the refusal');
  assert.deepEqual(tree(o.root),before);
  assert.throws(()=>createStore(config),/overlap|outside the plugin installation/);
 }
});

test('F8 saved-state doctor remains read-only and names wrong binding and policy',async t=>{
 const o=fixture(t),store=createStore(o);store.edit(textOp(store.model,'Saved'));store.close();
 let before=tree(o.root),text=await doctor(o);assert(text.includes('state binding verified'));assert.deepEqual(tree(o.root),before);
 const stateFile=path.join(o.dataRoot,'state.json'),state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 for(const [field,value,message] of [['sourceRoot',o.root,'Saved state belongs to another configured site.'],['allowExternal',true,'External-reference policy mismatch']]){
  privateWrite(stateFile,JSON.stringify({...state,[field]:value}));before=tree(o.root);text=await doctor(o);
  assert(text.includes(message));assert(text.includes('No repair is performed.'));assert(!text.includes(o.root));
  assert(!text.includes('not opened yet'),'saved-state refusal must not claim an unopened working copy');
  assert(!text.includes('state folder is non-empty'),'existing saved state is not an unopened-directory refusal');
  assert.deepEqual(tree(o.root),before);
  assert.throws(()=>createStore(o),/state belongs to another site or external-reference policy/);
 }
});


test('F8 saved-source doctor shows import success and detects original drift with export disabled',async t=>{
 const o=fixture(t),store=createStore({...o,exportRoot:undefined});store.close();
 const config={...o,exportRoot:undefined};
 let before=tree(o.root),text=await doctor(config);
 assert(text.includes('Source import: passed'));assert(text.includes('Original drift: none'));assert.deepEqual(tree(o.root),before);
 fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'<p>External source edit</p>');
 before=tree(o.root);text=await doctor(config);
 assert(text.includes('Source import: passed'));assert(text.includes('Original drift: detected'));assert.deepEqual(tree(o.root),before);
 const resumed=createStore(config);resumed.close();
});

test('F8 saved-source doctor explicitly refuses hard links, invalid UTF-8 and size overflow like runtime',async t=>{
 for(const variant of ['hard link','invalid UTF-8','oversize']){
  const o=fixture(t),config={...o,...(variant==='invalid UTF-8'?{exportRoot:undefined}:{})},store=createStore(config);store.close();
  if(variant==='hard link')fs.linkSync(path.join(o.sourceRoot,'index.html'),path.join(o.sourceRoot,'private-linked-name'));
  if(variant==='invalid UTF-8')privateWrite(path.join(o.sourceRoot,'styles.css'),Buffer.from([0xff]));
  if(variant==='oversize')privateWrite(path.join(o.sourceRoot,'styles.css'),Buffer.alloc(2*1024*1024+1,32));
  const before=tree(o.root),text=await doctor(config);
  assert(text.includes('Source import: refused by static-site validation'),variant+' must name a real refusal');
  assert(text.includes('Original drift: unverifiable'),variant+' must not claim a completed drift check');
  assert(!text.includes('Source import: passed'));assert(!text.includes('Site and state paths: absolute, separate, readable'));
  assert(!text.includes('private-linked-name'));assert(!text.includes(o.root));assert.deepEqual(tree(o.root),before);
  assert.throws(()=>createStore(config),variant==='hard link'?/hard link/:variant==='oversize'?/2 MiB/:{code:'ERR_ENCODING_INVALID_ENCODED_DATA'});
 }
});

test('F8 saved-source doctor names filesystem check failure without exposing the path or claiming drift',async t=>{
 const o=fixture(t),store=createStore(o);store.close();
 const blocked=path.join(o.sourceRoot,'index.html'),originalLstat=fs.lstatSync;
 const before=tree(o.root);
 const deny=function(file,...args){
  if(String(file)===blocked){const e=Error('private I/O details '+blocked);e.code='EACCES';throw e;}
  return originalLstat.call(this,file,...args);
 };
 const mocked=t.mock.method(fs,'lstatSync',deny);
 const text=await doctor(o);
 assert(text.includes('Source import: could not be checked; filesystem access failed.'));
 assert(text.includes('Original drift: unverifiable'));assert(!text.includes('Source import: passed'));assert(!text.includes('private I/O details'));assert(!text.includes(o.root));
 mocked.mock.restore();assert.deepEqual(tree(o.root),before,'compare the reader before startup legitimately takes/releases its lease');
 t.mock.method(fs,'lstatSync',deny);assert.throws(()=>createStore(o),{code:'EACCES'});
});
