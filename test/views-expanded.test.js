'use strict';
const {childEnv:osChildEnv}=require('./helpers');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,textOp}=require('./helpers'),{createStore}=require('../src/studio-store');
const {spawnSync}=require('node:child_process');const cli=path.join(__dirname,'../tools/site-studio-view.js');
function run(o,view,args=[]){return spawnSync(process.execPath,[cli,view,...args,'--site',o.sourceRoot,'--data-dir',o.dataRoot,'--export-dir',o.exportRoot,'--json'],{encoding:'utf8',timeout:process.platform==='win32'?30000:5000});}
function read(o,view,args=[]){const p=run(o,view,args);assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
function all(o,view,args=[]){let p=read(o,view,args),rows=[...p.rows];for(let i=0;p.nextOffset!==null;i++){assert(i<130);p=read(o,view,[...args,'--offset',String(p.nextOffset),'--snapshot',p.snapshot]);rows.push(...p.rows);}return rows.join('\n');}
test('rich home/pages/checkpoints reflect current state without absolute paths or secrets',t=>{
 const o=fixture(t),s=createStore(o);t.after(()=>s.close());s.checkpoint('First',0);s.edit(textOp(s.model));
 const home=all(o,'home');for(const word of ['live','Undo: 1','Redo: 0','1/10','128 MiB','External','export'])assert(home.includes(word),word);
 assert(!home.includes(o.root));assert.match(all(o,'pages'),/Home.*nodes|nodes.*Home/);assert(!all(o,'pages').includes('pixel.png'));assert(all(o,'pages',['--assets']).includes('pixel.png'));
 assert.match(all(o,'checkpoints'),/First.*1 changed/);
});
test('page source, CSS rules and folded search are bounded and pinned',t=>{
 const o=fixture(t);fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'<p>STRASSE Straße</p>');const s=createStore(o);t.after(()=>s.close());
 const html=all(o,'page',['index.html']);assert(html.includes('h1'));assert(html.includes('n_'));assert(html.includes('chars'));assert(html.includes('Home'));
 assert(all(o,'page',['styles.css']).includes('h1'));assert(!all(o,'page',['nested/pixel.png']).includes('iVBOR'));
 const found=all(o,'find',['strasse']);assert(found.includes('index.html'));assert.match(found,/line 1/);
 assert.equal(run(o,'find',['x'.repeat(8193)]).status,1);assert.equal(run(o,'page',['../state.json']).status,1);
});
test('changes lists added/removed/modified and bounded line replacements without asset bodies',t=>{
 const o=fixture(t),s=createStore(o);t.after(()=>s.close());s.checkpoint('Before change',0);s.edit(textOp(s.model,'After'));
 s.edit({type:'add_page',expectedRev:1,path:'new.html',title:'New'});
 const changes=all(o,'changes',['Before change']);assert(changes.includes('modified index.html'));assert(changes.includes('added new.html'));assert(changes.includes('2 changed files since checkpoint Before change (r0).'),changes);
 const latest=all(o,'changes');assert(latest.includes('since checkpoint Before change (r0). Default baseline is the latest checkpoint; use `changes original` for the opened original.'),latest);
 s.checkpoint('After change',2);const quiet=all(o,'changes');assert(quiet.includes('No changes since checkpoint After change (r2).'),quiet);assert(!quiet.includes('modified'));
 assert(all(o,'changes',['original']).includes('2 changed files since the opened original (r0).'));assert(all(o,'changes',['After change','index.html']).includes('No recorded change for this file since checkpoint After change (r2).'));
 const diff=all(o,'changes',['Before change','index.html']);assert(diff.includes('- '));assert(diff.includes('+ '));assert(diff.includes('After'));
 assert.equal(run(o,'changes',['unknown']).status,1);
});
test('check reports missing HTML/srcset/CSS/import targets and never fetches external references',t=>{
 const o=fixture(t);fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'<a href="gone.html">bad</a><img srcset="lost.png 1x, nested/pixel.png 2x"><a href="https://outside.invalid/private">remote</a>');
 fs.appendFileSync(path.join(o.sourceRoot,'styles.css'),'\n@import "missing.css"; p { background: url(lost.svg); }');const s=createStore(o);t.after(()=>s.close());
 const rows=all(o,'check');for(const expected of ['gone.html','lost.png','missing.css','lost.svg','External','nested/about.html'])assert(rows.includes(expected),expected);assert(!rows.includes('https://outside.invalid/private'));
});
test('doctor and dashboard explain refusals, and export shows read-only readiness facts',t=>{
 const o=fixture(t),s=createStore(o);t.after(()=>s.close());const before=fs.readFileSync(path.join(o.dataRoot,'state.json'));
 assert(all(o,'doctor').includes('live'));assert(all(o,'dashboard').includes('mcp-logs-plugin-toolsenabled-site-studio-site-studio'));assert(all(o,'dashboard').includes('Renew'));
 assert(all(o,'export').includes('Ready'));fs.appendFileSync(path.join(o.sourceRoot,'index.html'),'drift');assert(all(o,'export').includes('drift'));
 assert.deepEqual(fs.readFileSync(path.join(o.dataRoot,'state.json')),before);assert(!fs.existsSync(o.exportRoot));
 const file=path.join(o.dataRoot,'state.json'),old=JSON.parse(before);old.fingerprintVersion=1;fs.writeFileSync(file,JSON.stringify(old));assert.match(run(o,'home').stderr,/VIEW_UPGRADE/);
 assert.match(all(o,'doctor'),/upgrade/);fs.writeFileSync(file,before);
 const policy=JSON.parse(before);policy.allowExternal=true;fs.writeFileSync(file,JSON.stringify(policy));assert.match(run(o,'home').stderr,/VIEW_POLICY/);
});
test('missing state is neutral, defaults match the server, and view args never become a shell',t=>{
 const o=fixture(t);assert.match(all(o,'home'),/not opened yet/i);assert(!fs.existsSync(o.dataRoot));
 const env={...osChildEnv(),HOME:path.join(o.root,'home')};const p=spawnSync(process.execPath,[cli,'home','--json',...(process.platform==='win32'?['--site',o.sourceRoot,'--data-dir',o.dataRoot]:[])],{env,encoding:'utf8',timeout:process.platform==='win32'?30000:5000});assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/not opened yet/i);assert(!fs.existsSync(env.HOME));
});
