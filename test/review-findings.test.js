'use strict';
const {privateMkdir,privateWrite}=require('./helpers');
// Regression tests for the five findings of the 2026-10-13 product review of 0.1.6 (CHANGELOG 0.1.7).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {fixture,textOp}=require('./helpers'),{createStore}=require('../src/studio-store');
const {applyOp,indexHtml}=require('../src/web-model'),{tokenize}=require('../src/sanitize');
const {view}=require('../src/site-view');

// 1. A "/" that ends an unquoted attribute value is part of the value, not a self-closing flag.
const LINK='<main><p>See <a href=/blog/>the blog</a> now.</p></main>';
const htmlModel=source=>({rev:0,root:'site',files:[{id:'f',path:'index.html',kind:'html',source,nodes:indexHtml(source)}]});
const anchor=model=>model.files[0].nodes.find(n=>n.selectorHint==='a');
test('unquoted attribute value ending in a slash keeps its slash and its element stays paired',()=>{
 const model=htmlModel(LINK),a=anchor(model);
 assert.equal(a.paired,true);assert.equal(model.files[0].source.slice(...a.range),'<a href=/blog/>the blog</a>');
 const set=applyOp(model,{type:'set_attr',expectedRev:0,fileId:'f',nodeId:a.id,name:'class',value:'link'});
 assert.equal(set.files[0].source,'<main><p>See <a href="/blog/" class="link">the blog</a> now.</p></main>');
 const removed=applyOp(model,{type:'remove_element',expectedRev:0,fileId:'f',nodeId:a.id});
 assert.equal(removed.files[0].source,'<main><p>See  now.</p></main>');
 const {hash}=require('../src/web-model');
 const text=applyOp(model,{type:'set_text',expectedRev:0,fileId:'f',nodeId:a.id,baseHash:hash('<a href=/blog/>the blog</a>'),text:'posts'});
 assert.equal(text.files[0].source,'<main><p>See <a href=/blog/>posts</a> now.</p></main>');
 const root=applyOp(htmlModel('<main><p><a href=/>Home</a></p></main>'),{type:'set_attr',expectedRev:0,fileId:'f',nodeId:'n_2',name:'class',value:'x'});
 assert.equal(root.files[0].source,'<main><p><a href="/" class="x">Home</a></p></main>');
});
test('genuine self-closing slashes are still recognized',()=>{
 for(const source of ['<br/>','<img src="a.png"/>','<img src=\'a.png\'/>','<img src=a.png />','<input disabled/>','<img alt="x" src=a.png />']){
  const [t]=tokenize(source);assert.equal(t.self,true,source);
 }
 for(const [source,attrs] of [['<a href=/blog/>',' href=/blog/'],['<a href=/>',' href=/'],['<a href= />',' href= /'],['<a title=x href=/a/b/ >',' title=x href=/a/b/ ']]){
  const [t]=tokenize(source);assert.equal(t.self,false,source);assert.equal(t.attrs,attrs,source);
 }
});

// 2. The newest undo state survives the 96 MiB history target; only the 128 MiB ceiling removes it, with a warning.
test('a 24 MiB site keeps its newest undo state, and losing it to the 128 MiB ceiling is reported',{timeout:120000},t=>{
 const o=fixture(t);fs.mkdirSync(path.join(o.sourceRoot,'big'));
 for(let i=0;i<12;i++)privateWrite(path.join(o.sourceRoot,'big','blob'+i+'.bin'),crypto.randomBytes(2*1024*1024));
 const s=createStore(o);t.after(()=>s.close());
 const edited=s.edit(textOp(s.model,'Edited'));
 assert.equal(edited.rev,1);assert.equal(edited.undoPruned,undefined);assert.equal(s.status.undo,1,'the only undo state was pruned');
 assert(fs.statSync(path.join(o.dataRoot,'state.json')).size>96*1024*1024);
 const undone=s.human('undo',{expectedRev:1});assert.equal(undone.rev,2);assert.equal(s.status.redo,1);
 const h1=s.model.files.find(f=>f.path==='index.html').source;assert(h1.includes('<h1>Home</h1>'),'undo restored the text');
 // A checkpoint needs a fourth full copy: the ceiling removes the redo state, and the result says so.
 const saved=s.checkpoint('Large site',2);assert.equal(saved.label,'Large site');
 assert.match(saved.undoPruned,/128 MiB/);assert.equal(s.status.redo,0);assert.match(s.status.undoPruned,/redo/);
 assert(fs.statSync(path.join(o.dataRoot,'state.json')).size<=128*1024*1024);
});

// 3. web_draw output must render as a standalone SVG file: the SVG namespace on the root, and xmlns:xlink when used.
function xmlCheck(svg){
 const code='import sys\nfrom xml.dom import minidom\nd=minidom.parseString(sys.stdin.buffer.read())\nprint(d.documentElement.namespaceURI)';
 return spawnSync(process.env.PYTHON||'python3',['-I','-c',code],{input:svg,encoding:'utf8',timeout:15000});
}
test('drawn SVG gets the namespace declarations a standalone file needs',()=>{
 const draw=content=>applyOp(htmlModel('<main></main>'),{type:'add_asset',expectedRev:0,path:'art.svg',content}).files.at(-1).source;
 const plain=draw('<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>');
 assert.equal(plain,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>');
 const linked=draw('<svg viewBox="0 0 20 20"><defs><circle id="c" r="5"/></defs><use xlink:href="#c"/></svg>');
 assert.equal(linked,'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 20 20"><defs><circle id="c" r="5"/></defs><use xlink:href="#c"/></svg>');
 const declared='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 2 2"><use xlink:href="#c"/></svg>';
 assert.equal(draw(declared),declared,'complete declarations are unchanged');
 const modern='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><use href="#c"/></svg>';assert.equal(draw(modern),modern);
 for(const svg of [plain,linked,declared]){const p=xmlCheck(svg);assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'http://www.w3.org/2000/svg');}
 assert.notEqual(xmlCheck('<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="#c"/></svg>').status,0,'the XML check detects an unbound prefix');
});

// 4. "original" is the changes view's keyword for the opened original, so no checkpoint may take that name.
test('a checkpoint cannot be labelled with the changes keyword "original"',async t=>{
 const o=fixture(t),s=createStore(o);t.after(()=>s.close());
 for(const label of ['original','Original','ORIGINAL'])assert.throws(()=>s.checkpoint(label,0),/invalid checkpoint label/,label);
 for(const label of ['Original layout','originals','The original'])assert.equal(s.checkpoint(label,0).label,label);
 s.edit(textOp(s.model));
 const rows=(await view({...o,view:'changes',args:['original']})).rows.join('\n');assert.match(rows,/since the opened original \(r0\)/);
});
test('a saved checkpoint named "original" is shown as an imported checkpoint after restart',async t=>{
 const o=fixture(t);let s=createStore(o);s.checkpoint('Saved',0);s.close();
 const file=path.join(o.dataRoot,'state.json'),state=JSON.parse(fs.readFileSync(file,'utf8'));state.checkpoints[0].label='original';privateWrite(file,JSON.stringify(state));
 const listed=(await view({...o,view:'checkpoints'})).rows.join('\n');assert(listed.includes('Imported checkpoint 1'),listed);assert(!/^original ·/m.test(listed),listed);
 s=createStore(o);t.after(()=>s.close());assert.deepEqual(s.status.checkpoints.map(c=>c.label),['Opened working copy (r0)','Imported checkpoint 1']);
});

// 5. A first start killed during its first commit leaves working-<hex> and state.json.<hex>.tmp; the next start
// removes them when they hold only (part of) a copy of the original, and refuses anything else as before.
function leftovers(o,{extra=false}={}){
 privateMkdir(o.dataRoot,{mode:0o700});
 const work=path.join(o.dataRoot,'working-'+crypto.randomBytes(16).toString('hex'));privateMkdir(path.join(work,'nested'),{recursive:true,mode:0o700});
 privateWrite(path.join(work,'styles.css'),fs.readFileSync(path.join(o.sourceRoot,'styles.css')));
 privateWrite(path.join(work,'index.html'),fs.readFileSync(path.join(o.sourceRoot,'index.html')).subarray(0,20));
 if(extra)privateWrite(path.join(work,'nested','notes.txt'),'user content');
 const temp=path.join(o.dataRoot,'state.json.'+crypto.randomBytes(8).toString('hex')+'.tmp');privateWrite(temp,'{"version":1,"fingerprintVersion":2,"sourceRo');
 return {work,temp};
}
function captureStderr(t){const lines=[],write=process.stderr.write;process.stderr.write=function(chunk,...rest){lines.push(String(chunk));return write.call(this,chunk,...rest);};t.after(()=>{process.stderr.write=write;});return lines;}
test('leftovers of an interrupted first start are removed with a one-line notice',async t=>{
 const o=fixture(t),{work,temp}=leftovers(o);
 const doctor=(await view({...o,view:'doctor'})).rows.join('\n');
 assert(!doctor.includes('non-empty'),doctor);assert.match(doctor,/2 leftovers of an interrupted first start/);assert(fs.existsSync(work)&&fs.existsSync(temp),'doctor changes nothing');
 const lines=captureStderr(t),s=createStore(o);t.after(()=>s.close());
 assert.equal(s.model.rev,0);assert(!fs.existsSync(work));assert(!fs.existsSync(temp));
 assert.equal(lines.filter(l=>l.includes('interrupted first start')).length,1,lines.join(''));
 assert.deepEqual(fs.readdirSync(o.dataRoot).filter(n=>n!=='lease.json'&&n!=='state.json').map(n=>n.slice(0,8)),['working-']);
});
test('a working folder that is not a copy of the original still blocks startup and is kept',t=>{
 const o=fixture(t),{work,temp}=leftovers(o,{extra:true});
 assert.throws(()=>createStore(o),/state root must be an empty dedicated directory/);
 assert.equal(fs.readFileSync(path.join(work,'nested','notes.txt'),'utf8'),'user content');assert(fs.existsSync(temp));
 const p=fixture(t),saved=leftovers(p);fs.rmSync(saved.work,{recursive:true});
 const s=createStore(p);s.edit(textOp(s.model));s.checkpoint('Edited',1);s.close();
 // A complete temporary state that already holds edits is not a first-start leftover.
 const other=fixture(t);privateMkdir(other.dataRoot,{mode:0o700});const copy=path.join(other.dataRoot,'state.json.0123456789abcdef.tmp');
 privateWrite(copy,fs.readFileSync(path.join(p.dataRoot,'state.json')));
 assert.throws(()=>createStore(other),/state root must be an empty dedicated directory/);assert(fs.existsSync(copy));
});
