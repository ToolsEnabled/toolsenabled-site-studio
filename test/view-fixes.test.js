'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {fixture,textOp}=require('./helpers'),{createStore}=require('../src/studio-store'),{hash}=require('../src/web-model');
const root=path.join(__dirname,'..'),cli=path.join(root,'tools/site-studio-view.js');
function cliRun(args,env){return spawnSync(process.execPath,[cli,...args,'--json'],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,...env}});}
function rowsOf(o,view,args=[]){
 const read=extra=>{const r=cliRun([view,...args,'--site',o.sourceRoot,'--data-dir',o.dataRoot,...extra]);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 let p=read([]);const rows=[...p.rows];
 for(let i=0;p.nextOffset!==null;i++){assert(i<130);p=read(['--offset',String(p.nextOffset),'--snapshot',p.snapshot]);rows.push(...p.rows);}
 return rows;
}
test('changes shows the differing span and column of an edit deep inside a one-line page',t=>{
 const o=fixture(t),filler='<p>'+'Lorem ipsum dolor sit amet. '.repeat(108)+'</p>';
 fs.writeFileSync(path.join(o.sourceRoot,'index.html'),'<!doctype html><html><head><title>Home</title><link rel="stylesheet" href="styles.css"></head><body><main>'+filler+'<h1>Home</h1><p>Welcome</p><img src="nested/pixel.png" alt="Pixel"></main></body></html>');
 const original=fs.readFileSync(path.join(o.sourceRoot,'index.html'),'utf8'),at=original.indexOf('<h1>Home')+4;assert(at>3000);
 const s=createStore(o);t.after(()=>s.close());s.edit(textOp(s.model,'After'));
 const rows=rowsOf(o,'changes',['original','index.html']),minus=rows.filter(r=>r.startsWith('- ')),plus=rows.filter(r=>r.startsWith('+ '));
 assert.equal(minus.length,1);assert.equal(plus.length,1);
 assert.notEqual(minus[0].slice(2),plus[0].slice(2),'the displayed rows must differ');
 assert(minus[0].includes('Home</h1>'),minus[0]);assert(plus[0].includes('After</h1>'),plus[0]);
 assert(minus[0].includes('col '+(at+1)),minus[0]);assert(plus[0].includes('col '+(at+1)),plus[0]);
});
test('changes says where a difference is when the displayed text cannot show it',async()=>{
 const {safeText}=await import('../hooks/view-contract.mjs'),{project}=require('../src/view-content');
 const page=source=>({path:'index.html',kind:'text',encoding:'utf8',source});
 const before='a'.repeat(3000)+'\u0001 tail',after='a'.repeat(3000)+'\u0002 tail';
 const state={model:{rev:1,files:[page(after)]},openedModel:{rev:0,files:[page(before)]},checkpoints:[],history:[]};
 const rows=project({state,view:'changes',args:['original','index.html']},(value,n=160)=>safeText(value,n));
 const minus=rows.find(r=>r.startsWith('- ')),plus=rows.find(r=>r.startsWith('+ '));
 assert(minus&&plus,rows.join('\n'));assert(minus.includes('col 3001'),minus);
 assert(rows.some(r=>r.includes('beyond')||r.includes('hidden')),rows.join('\n'));
});
test('Codex default state folder matches the server when SITE_STUDIO_ROOT ends with a separator',t=>{
 const o=fixture(t),home=path.join(o.root,'home');fs.mkdirSync(home,{mode:0o700});
 const env={HOME:home,USERPROFILE:home,SITE_STUDIO_ROOT:o.sourceRoot+path.sep};
 const started=spawnSync(process.execPath,['-e',"require(process.argv[1]).createStore({}).close()",path.join(root,'src/studio-store.js')],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,...env}});
 assert.equal(started.status,0,started.stderr);
 assert(fs.existsSync(path.join(home,'.site-studio',hash(o.sourceRoot).slice(7,23),'state.json')),'server default state folder');
 const r=cliRun(['home'],env);assert.equal(r.status,0,r.stderr);
 const rows=JSON.parse(r.stdout).rows;assert(rows[0].startsWith('Working copy r0'),rows[0]);
});
test('help gives Codex the same required arguments as the Claude command',async()=>{
 const {HELP,VIEWS}=await import('../hooks/view-contract.mjs');
 const marker=' · Codex: !node <installed-plugin>/tools/site-studio-view.js ';
 const viewRows=HELP.filter(row=>row.startsWith('/site-studio '));assert.equal(viewRows.length,VIEWS.length);
 for(const row of viewRows){
  assert(row.includes(marker),row);const [claude,codex]=row.split(marker);
  assert.equal(codex,claude.slice('/site-studio '.length),row);
 }
 for(const [view,args] of [['page','"path"'],['find','"text"'],['changes','["label"|original] ["path"]'],['pages','[--assets]']])
  assert(HELP.some(row=>row.endsWith('site-studio-view.js '+view+' '+args)),view);
});
