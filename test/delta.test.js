'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const path=require('node:path');
const root=path.join(__dirname,'..');
function bounded(script,timeout=2500){const r=spawnSync(process.execPath,['-e',script],{cwd:root,timeout,encoding:'utf8'});assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stderr);}
test('CSS writes and removals scan large separator runs within a time budget',()=>{
 bounded(`const {applyOp}=require('./src/web-model');const assert=require('node:assert/strict');
 for(const separator of ['\\n','\\r\\n',' \\n','\\u2028']){
 const source=separator.repeat(Math.floor(2*1024*1024/Buffer.byteLength(separator)-100))+'.old { color: red; }';
 const model={root:'site',rev:0,files:[{id:'css',path:'styles.css',kind:'css',source,nodes:[]}]};
 const next=applyOp(model,{type:'css_rule_set',fileId:'css',expectedRev:0,selector:'.hero',declarations:'color: navy;'});
 assert(next.files[0].source.endsWith('.hero { color: navy; }\\n'));
 const removed=applyOp(model,{type:'css_rule_remove',fileId:'css',expectedRev:0,selector:'.old'});assert.equal(removed.files[0].source.trim(),'');
 }`);
});
test('CSS declarations refuse Unicode separators and controls other than ordinary space',()=>{
 const {css}=require('../src/sanitize');for(const c of ['\r','\n','\t','\u0085','\u00a0','\u1680','\u2000','\u2028','\u2029','\u202f','\u205f','\u3000','\u200b','\u2060'])assert.throws(()=>css('color: red;'+c.repeat(20)+'margin: 0'),/CSS|declaration/,JSON.stringify(c));assert.equal(css('color: red; margin: 0'),'color: red; margin: 0');
});
module.exports={bounded};

test('held unauthenticated sockets do not exclude new human requests',async t=>{
 const net=require('node:net'),http=require('node:http');const {fixture}=require('./helpers');const {createCoordinator}=require('../src/web-server');const {openSession,issuePreview}=require('./session-helper');
 const app=createCoordinator(fixture(t));t.after(()=>app.close());await app.listen();const {headers}=await openSession(app.launchUrl);const status=await (await fetch(app.previewUrl+'/api/status',{headers})).json();const preview=await issuePreview(app.previewUrl,headers);
 for(const [base,route,auth] of [[app.previewUrl,'/api/status',headers],[app.siteUrl,new URL(preview.url).pathname+'/index.html',preview.headers]]){
  const sockets=[];t.after(()=>sockets.forEach(s=>s.destroy()));
  await Promise.all(Array.from({length:48},()=>new Promise(resolve=>{const s=net.createConnection(new URL(base).port,'127.0.0.1');sockets.push(s);s.on('error',resolve);s.resume();s.once('connect',()=>{s.write('GET / HTTP/1.1\r\nHost:');resolve();});})));
  const code=await new Promise((resolve,reject)=>{const r=http.get(base+route,{agent:false,headers:auth},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.setTimeout(1500,()=>r.destroy(Error('human request timed out')));});assert.equal(code,200);sockets.forEach(s=>s.destroy());
 }
});

test('HTML indexing is linear on 2 MiB of unmatched closing tags',()=>{
 bounded(`const {indexHtml}=require('./src/web-model');const assert=require('node:assert/strict');const n=Math.floor(2*1024*1024/9);assert.equal(indexHtml('<div>'.repeat(n)+'</p>'.repeat(n)).length,0);const nodes=indexHtml('<main><div><p>x</main></p>');assert.equal(nodes.length,1);assert.equal(nodes[0].selectorHint,'main');`);
});
test('an edit only indexes its changed HTML file',()=>{
 const model=require('../src/web-model'),safe=require('../src/sanitize');const source='<h1>Hi</h1>',other='<div>'.repeat(100)+'</p>'.repeat(100);const original=safe.tokenize;
 const doc={rev:0,root:'site',files:[{id:'a',path:'a.html',kind:'html',source,nodes:model.indexHtml(source)},{id:'b',path:'b.html',kind:'html',source:other,nodes:[]}]};
 safe.tokenize=s=>{assert.notEqual(s,other,'unchanged file was indexed');return original(s);};try{assert.equal(model.applyOp(doc,{type:'set_text',expectedRev:0,fileId:'a',nodeId:'n_0',baseHash:model.hash(source),text:'New'}).rev,1);}finally{safe.tokenize=original;}
});
for(const entry of ['mcp-web.js','web-server.js'])test(entry+' cancels startup import and releases its lease on SIGTERM',async t=>{
 const fs=require('node:fs');const {fixture}=require('./helpers');const {start}=require('./mcp-helper');const o=fixture(t);const n=Math.floor(2*1024*1024/9);const source='<div>'.repeat(n)+'</p>'.repeat(n);for(let i=0;i<8;i++)fs.writeFileSync(path.join(o.sourceRoot,'dense'+i+'.html'),source);
 const m=start(o,entry);t.after(async()=>{if(m.child.exitCode===null&&m.child.signalCode===null)m.child.kill('SIGKILL');await m.exited;});const lease=path.join(o.dataRoot,'lease.json');const end=Date.now()+5000;while(!fs.existsSync(lease)&&Date.now()<end)await new Promise(r=>setTimeout(r,2));assert(fs.existsSync(lease));assert(!m.stderr.includes('dashboard session:'));
 m.child.kill('SIGTERM');let timer;try{assert.deepEqual(await Promise.race([m.exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('startup cancellation exceeded 2500 ms')),2500);})]),{code:0,signal:null});}finally{clearTimeout(timer);}assert(!fs.existsSync(lease));
});

test('attribute parsing does not rescan a large trailing whitespace run',()=>{
 bounded(`const {parseAttrs}=require('./src/sanitize');const raw=Array.from({length:12000},(_,i)=>' a'+i+'="x"').join('')+' '.repeat(1500000);require('node:assert/strict').equal(parseAttrs(raw).length,12000);`);
});

test('preview transformations are cached across query variants and invalidated on commit',()=>{
 bounded(`(async()=>{const assert=require('node:assert/strict');const cleanup=[];const o=require('./test/helpers').fixture({after:fn=>cleanup.push(fn)});const preview=require('./src/preview-content');const original=preview.previewBytes;let calls=0;preview.previewBytes=(...args)=>{calls++;return original(...args);};const app=require('./src/web-server').createCoordinator(o);try{await app.listen();const {url:base,headers}=await require('./test/session-helper').previewSession(app);for(let i=0;i<8;i++)await (await fetch(base+'/index.html?'+i,{headers})).text();assert.equal(calls,1);app.edit(require('./test/helpers').textOp(app.model,'Changed'));assert((await (await fetch(base+'/index.html',{headers})).text()).includes('Changed'));assert.equal(calls,2);}finally{await app.close();for(const fn of cleanup.reverse())await fn();}})().catch(e=>{console.error(e);process.exitCode=1;});`);
});

test('unparseable meta refresh tags fail closed in preview bytes',()=>{
 const {previewBytes}=require('../src/preview-content');for(const tag of ['<meta http-equiv="refresh" http-equiv="refresh" content="0;url=other.html">','<meta http-equiv="refresh"x="1" content="0;url=other.html">','<meta http-equiv=refresh content=0;url=other.html>']){
  const file={kind:'html',path:'index.html',source:tag+'<h1>Stay</h1>'};const body=previewBytes(file,'/view/test').toString();assert.equal(body,'<h1>Stay</h1>');assert(file.source.startsWith(tag));
 }
});

test('malformed imported URLs do not blank the served preview',async t=>{
 const fs=require('node:fs');const {fixture}=require('./helpers');const o=fixture(t);const html='<h1>Still visible</h1><img src="\\\\[logo"><img src="/\\[x">';fs.writeFileSync(path.join(o.sourceRoot,'index.html'),html);
 const app=require('../src/web-server').createCoordinator(o);t.after(()=>app.close());await app.listen();const {url:base,headers}=await require('./session-helper').previewSession(app);const r=await fetch(base+'/index.html',{headers});assert.equal(r.status,200);assert.match(await r.text(),/Still visible/);assert.equal(app.model.files.find(f=>f.path==='index.html').source,html);
});

test('case-insensitive search reports original UTF-16 offsets within a time budget',()=>{
 bounded(`const {call}=require('./mcp-web');const assert=require('node:assert/strict');
 const source='İ'.repeat(250000)+'😀 MARK '+(' İ MARK'.repeat(99));const app={model:{rev:0,files:[{id:'text',path:'text.txt',kind:'text',source}]}};
 const result=JSON.parse(call(app,'web_find',{query:'mark',limit:100}).content[0].text);assert.equal(result.hits.length,100);for(const h of result.hits)assert.equal(source.slice(h.offset,h.offset+4),'MARK');
 const sample='Straße ς Σ σ ﬃ İ';app.model.files[0].source=sample;
 for(const [query,offset] of [['STRASSE',0],['σ',7],['FFI',13],['i\\u0307',15]])assert.equal(JSON.parse(call(app,'web_find',{query,limit:1}).content[0].text).hits[0].offset,offset);
 `);
});

test('browser harness keeps zygote enabled unless sandbox disabling is explicit',async t=>{
 const fs=require('node:fs');const {fixture}=require('./helpers');const o=fixture(t);const fake=path.join(o.root,'fake-chrome'),record=path.join(o.root,'flags.json');
 fs.writeFileSync(fake,'#!/usr/bin/env node\n'+`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));let input='';const stream=fs.createReadStream(null,{fd:3});stream.on('data',b=>{input+=b;let at;while((at=input.indexOf('\\0'))>=0){const msg=JSON.parse(input.slice(0,at));input=input.slice(at+1);const result=msg.method==='Target.createTarget'?{targetId:'target'}:msg.method==='Target.attachToTarget'?{sessionId:'session'}:{};fs.writeSync(4,JSON.stringify({id:msg.id,result})+'\\0');if(msg.method==='Browser.close')process.exit(0);}});`);fs.chmodSync(fake,0o700);
 const saved={chrome:process.env.SITE_STUDIO_CHROME,noSandbox:process.env.SITE_STUDIO_CHROME_NO_SANDBOX};
 try{process.env.SITE_STUDIO_CHROME=fake;for(const off of ['0','1']){process.env.SITE_STUDIO_CHROME_NO_SANDBOX=off;const b=await require('./browser-helper').browser();try{const flags=JSON.parse(fs.readFileSync(record));assert.equal(flags.includes('--no-sandbox'),off==='1');assert.equal(flags.includes('--no-zygote'),off==='1');}finally{await b.close();}}}
 finally{for(const [key,value] of [['SITE_STUDIO_CHROME',saved.chrome],['SITE_STUDIO_CHROME_NO_SANDBOX',saved.noSandbox]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('preview strips referrer overrides from HTML, malformed tags and SVG',()=>{
 const {previewBytes}=require('../src/preview-content');
 const source='<meta name="referrer" content="unsafe-url"><img referrerpolicy="unsafe-url" src="https://example.test/x"><img referrerpolicy="unsafe-url" referrerpolicy="origin" src="https://example.test/y">';
 const body=previewBytes({kind:'html',path:'index.html',source},'/view/test').toString();assert(!body.includes('unsafe-url'));assert(!body.includes('<meta'));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><foreignObject><meta NAME="referrer" CONTENT="unsafe-url"/></foreignObject><image referrerpolicy="unsafe-url" href="https://example.test/x"/></svg>';
 const result=previewBytes({kind:'asset',path:'image.svg',encoding:'base64',source:Buffer.from(svg).toString('base64')},'/view/test').toString();assert(!result.includes('unsafe-url'));assert(result.includes('viewBox="0 0 20 20"'));
});

test('CSS sets replace a rule after comments, at-rule statements and broken string lines',()=>{
 const {applyOp}=require('../src/web-model'),{cssRules}=require('../src/css-rules');
 for(const prefix of ['/* heading */\n','@charset "UTF-8";\n','@import "theme.css";\n','/* x */ @import url("a;b.css"); /* y */\n','"broken\n',"'broken\r\n"]){
  let model={root:'site',rev:0,files:[{id:'css',path:'styles.css',kind:'css',source:prefix+'h1 { color: red; margin: 12px; }\np { color: green; }',nodes:[]}]};
  for(const declarations of ['color: navy;','color: blue;'])model=applyOp(model,{type:'css_rule_set',fileId:'css',expectedRev:model.rev,selector:'h1',declarations});
  const rules=[...cssRules(model.files[0].source)];assert.equal(rules.filter(r=>r.selector==='h1').length,1,prefix);assert(!model.files[0].source.includes('margin: 12px'),prefix);assert(model.files[0].source.startsWith(prefix),prefix);assert.equal(rules.at(-1).selector,'p');
 }
 const rules=[...cssRules('h1/* heading */ { color: red; }')];assert.equal(rules[0].selector,'h1');
});
test('CSS authoring refuses unbalanced quote and bracket state before it can blind reads',()=>{
 const {applyOp}=require('../src/web-model'),{css}=require('../src/sanitize');
 for(const declarations of ['content: "x',"content: 'x",'width: calc(1px','color: red]'])assert.throws(()=>css(declarations),/CSS|declaration/);
 const model={root:'site',rev:0,files:[{id:'css',path:'styles.css',kind:'css',source:'h1 { color: red; }',nodes:[]}]};
 for(const selector of ['a[title="x]','a[title=x',"a[title='x']("])assert.throws(()=>applyOp(model,{type:'css_rule_set',fileId:'css',expectedRev:0,selector,declarations:'color: blue'}),/stylesheet/);
 assert.equal(css('content: "x"; width: calc(10px + 2px)'), 'content: "x"; width: calc(10px + 2px)');
});

test('preview tokenizer handles browser comment, raw closing and foreign-content boundaries',()=>{
 const {previewBytes}=require('../src/preview-content'),{tokenize}=require('../src/sanitize');
 const meta='<meta name="referrer" content="unsafe-url">';
 for(const source of ['<!-->'+meta+'<!-- -->','<!--->'+meta+'<!-- -->','<!-- x --!>'+meta+'<!-- -->',"<!x '>"+meta+"'>","<?x '>"+meta+"'>","</p '>"+meta+"'>",'<script></script/>'+meta+'</script>','<style></style x>'+meta+'</style>','<title></title/>'+meta+'</title>','<svg><style>'+meta+'</style></svg>','<svg><textarea>'+meta+'</textarea></svg>']){
  assert(!previewBytes({kind:'html',path:'index.html',source},'/view/test').toString().includes(meta),source);
 }
 for(const tag of ['script','textarea','style']){
  const source='<'+tag+' a"b"c>'+meta+'</'+tag+'><h1>Visible</h1>',body=previewBytes({kind:'html',path:'index.html',source},'/view/test').toString();assert(!body.includes(meta));assert(body.includes('<h1>Visible</h1>'));
 }
 assert.equal(tokenize('<p>if a < b then c</p>').filter(t=>t.text!==undefined).map(t=>t.text).join(''),'if a < b then c');
});

test('no-hit Unicode web_find avoids a per-character offset map under a time budget',()=>{
 bounded(`const {call}=require('./mcp-web');const assert=require('node:assert/strict');
 for(const source of ['a'.repeat(2*1024*1024-3)+'—','界'.repeat(Math.floor(2*1024*1024/3))]){
 const app={model:{rev:0,files:Array.from({length:15},(_,i)=>({id:'f'+i,path:i+'.txt',kind:'text',source}))}};
 for(let i=0;i<2;i++)assert.deepEqual(JSON.parse(call(app,'web_find',{query:'NO-HIT',limit:100}).content[0].text).hits,[]);
 }`,2500);
});
test('case folding preserves the Unicode table and rejects matches inside expansions',()=>{
 const {fold,search}=require('../src/caseless-search'),{mapping}=require('../src/case-fold.json');
 for(const [c,expected] of Object.entries(mapping))assert.equal(fold(c),expected,JSON.stringify(c));
 const mixed=Object.keys(mapping).join('')+'\u1c89\ua7cb\u{10d50}😀';assert.equal(fold(mixed),Array.from(mixed,c=>mapping[c]??c).join(''));
 assert.equal(fold('ΟΣ ΟΣΑ Straße İ ﬃ'),'οσ οσα strasse i\u0307 ffi');
 for(const [source,query] of [['ßx','sx'],['ß','s'],['ﬃ','fi'],['İ','i']])assert.deepEqual(search(source,fold(query),100),[],source+' / '+query);
 const source='😀 İ ßx ﬃ';for(const [query,offset] of [['i\u0307',3],['ssx',5],['ffi',8]])assert.equal(search(source,fold(query),1)[0].offset,offset);
});

test('caseless search retries overlapping candidates and never splits a surrogate pair',()=>{
 const {fold,search}=require('../src/caseless-search');
 assert.equal(search('Sß',fold('ss'),10)[0].offset,1);
 assert.deepEqual(search('😀','\ud83d',10),[]);assert.deepEqual(search('😀','\ude00',10),[]);
 assert.equal(search('😀X😀',fold('x😀'),10)[0].offset,2);
});

test('CSS scanning skips escaped delimiters outside strings',()=>{
 const {applyOp}=require('../src/web-model'),{cssRules}=require('../src/css-rules');
 for(const selector of ['.a\\;b','.a\\{b','.a\\}b','.a\\\\b']){
  const prefix=selector+' { color: red; }\n';const source=prefix+'b { margin: 12px; }';
  const model={root:'site',rev:0,files:[{id:'css',path:'styles.css',kind:'css',source,nodes:[]}]};
  assert.deepEqual([...cssRules(source)].map(rule=>rule.selector),[selector,'b']);
  const next=applyOp(model,{type:'css_rule_set',fileId:'css',expectedRev:0,selector:'b',declarations:'color: blue;'});
  assert.equal(next.files[0].source,prefix+'b { color: blue; }');
 }
});

test('search over dense full-fold exceptions stays within its time budget',()=>{
 bounded(`const {call}=require('./mcp-web'),assert=require('node:assert/strict');
 for(const c of ['ß','Σ','Ꭰ']){const source=c.repeat(Math.floor(2*1024*1024/Buffer.byteLength(c)));const app={model:{rev:0,files:Array.from({length:5},(_,i)=>({id:'f'+i,path:i+'.txt',kind:'text',source}))}};assert.deepEqual(JSON.parse(call(app,'web_find',{query:'no-hit'}).content[0].text).hits,[]);}`,4000);
});

test('preview rebuilding preserves named entities and legacy HTML doctypes',()=>{
 const {previewBytes}=require('../src/preview-content');
 const legacy='<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
 const source=legacy+'<a title="Wait&hellip; &copy; &NotEqualTilde;" href="about.html">Next</a>';
 const body=previewBytes({kind:'html',path:'index.html',source},'/view/test').toString();
 assert(body.startsWith(legacy));assert(body.includes('title="Wait… © ≂̸"'));assert(!body.includes('&amp;hellip;'));
});

test('preview serializes every opening tag and escapes retained RAW text',()=>{
 const {previewBytes}=require('../src/preview-content');
 const hidden='</textarea><meta name=referrer content=unsafe-url>';
 for(const head of ['<svg><foreignObject><textarea>','<svg><desc><textarea>','<math><mtext><textarea>','<svg/x><textarea>']){
  const source=head+'<p title="'+hidden+'">X</p></textarea></foreignObject></svg>';
  const body=previewBytes({kind:'html',path:'index.html',source},'/preview/public').toString();
  assert(!body.includes('title="'+hidden),'raw opening tag passed through');assert(!body.includes('<meta'));
 }
 for(const head of ['<svg/ ><style>','<svg x=a/><style>','<svg><desc><p></svg><style>']){
  const body=previewBytes({kind:'html',path:'index.html',source:head+'<meta name=referrer content=unsafe-url></style>'},'/preview/public').toString();assert(!body.includes('<meta'));
 }
});

test('SVG preview handles CDATA, internal namespace entities and XML RAW names',()=>{
 const {previewBytes}=require('../src/preview-content');
 const render=source=>previewBytes({kind:'asset',path:'art.svg',encoding:'base64',source:Buffer.from(source).toString('base64')},'/preview/public').toString();
 const source='<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_svg "http://www.w3.org/2000/svg"><!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">]><svg xmlns="&ns_svg;" xmlns:i="&ns_ai;"><style><![CDATA[.paint { fill: red; }]]></style><rect class="paint" width="10" height="10"/></svg>';
 const out=render(source);assert(!out.includes('<!DOCTYPE'));assert(out.includes('xmlns="http://www.w3.org/2000/svg"'));assert(out.includes('<![CDATA[.paint { fill: red; }]]>'));
 for(const root of ['html xmlns="http://www.w3.org/1999/xhtml"','s:svg xmlns:s="http://www.w3.org/2000/svg"']){
  const result=render('<'+root+'><title><meta xmlns="http://www.w3.org/1999/xhtml" name="referrer" content="unsafe-url"/></title></'+root.split(' ')[0]+'>');assert(!result.includes('<meta'));
 }
 assert.throws(()=>render('<!DOCTYPE svg [<!ENTITY e "'+'x'.repeat(4096)+'">]><svg><text>'+'&e;'.repeat(3000)+'</text></svg>'),/preview.*limit/i);
 assert(render('<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[url(/literal)]]></text></svg>').includes('<![CDATA[url(/literal)]]>'));
 // Unsupported entity expansion is never handed to the browser's XML parser.
 for(const declaration of ['<!ENTITY x SYSTEM "file:///etc/passwd">','<!ENTITY x "&x;&x;">','<!ENTITY % x "boom">']){
  const out=render('<!DOCTYPE svg ['+declaration+']><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>');assert(!out.includes('<!ENTITY'));assert(out.includes('&amp;x;'));
 }
});

test('maximum rejected caseless queries complete in linear time',()=>{
 bounded(`const {call}=require('./mcp-web');const assert=require('node:assert/strict');
 const source='ß'.repeat(1024*1024);const app={model:{rev:0,files:[{id:'dense',path:'dense.txt',kind:'text',source}]}};
 assert.deepEqual(JSON.parse(call(app,'web_find',{query:'S'.repeat(8191),limit:100}).content[0].text).hits,[]);
 app.model.files[0].source='ﬃ'.repeat(600000);assert.deepEqual(JSON.parse(call(app,'web_find',{query:'FFI'.repeat(2730)+'F',limit:100}).content[0].text).hits,[]);
 `,3000);
});

test('caseless matcher agrees with whole-character reference over overlapping cases',()=>{
 const {fold,search}=require('../src/caseless-search');
 const alphabet=['S','ß','İ','ﬃ','😀','\ud83d','\ude00','Σ','A'];let seed=31;
 const next=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 function reference(source,query){const chunks=Array.from(source,c=>({c,folded:fold(c)}));let text='',offset=0;const boundaries=new Map([[0,0]]);for(const part of chunks){text+=part.folded;offset+=part.c.length;boundaries.set(text.length,offset);}const out=[];for(let at=0;at<=text.length-query.length;at++){if(text.startsWith(query,at)&&boundaries.has(at)&&boundaries.has(at+query.length)){out.push(boundaries.get(at));at+=query.length-1;}}return out;}
 for(let i=0;i<12000;i++){const source=Array.from({length:next(18)+1},()=>alphabet[next(alphabet.length)]).join('');const query=fold(Array.from({length:next(5)+1},()=>alphabet[next(alphabet.length)]).join(''));assert.deepEqual(search(source,query,100).map(h=>h.offset),reference(source,query),JSON.stringify({source,query}));}
});

test('newer Unicode characters do not disable bulk folding of surrounding text',()=>{
 bounded(`const {call}=require('./mcp-web'),{fold}=require('./src/caseless-search');const assert=require('node:assert/strict');
 for(const newer of ['\\u1c89','\\ua7cb','\\u{10d50}']){
  const source='ß'.repeat(512000)+newer+'Σ'.repeat(510000);
  const app={model:{rev:0,files:Array.from({length:5},(_,i)=>({id:'f'+i,path:i+'.txt',kind:'text',source}))}};
  assert.deepEqual(JSON.parse(call(app,'web_find',{query:'NO-HIT',limit:100}).content[0].text).hits,[]);
  assert.equal(fold('Σ'+newer+'ß'),'σ'+newer+'ss');
 }`,4000);
});

test('XML custom entities are not expanded in URL-bearing attributes or CSS',()=>{
 const {previewBytes}=require('../src/preview-content');
 const render=source=>previewBytes({kind:'asset',path:'art.svg',encoding:'base64',source:Buffer.from(source).toString('base64')},'/preview/'+'a'.repeat(24)).toString();
 const source='<!DOCTYPE svg [<!ENTITY items "'+('x,'.repeat(2000))+'"><!ENTITY color "red">]><svg xmlns="http://www.w3.org/2000/svg"><image srcset="'+('&items;'.repeat(100))+'"/><style>a { fill: &color; }</style><text>&color;</text></svg>';
 const result=render(source);assert(result.length<16384,'URL expansion inflated the output');assert(result.includes('&amp;items;'));assert(result.includes('fill: &amp;color;'));assert(result.includes('<text>red</text>'));
 for(const attr of ['href','xlink:href','src','srcset','style','fill','filter','mask','cursor','marker-start'])assert(render('<!DOCTYPE svg [<!ENTITY x "logo.svg">]><svg '+attr+'="&x;"/>').includes('&amp;x;'),attr);
});

test('preview limits count UTF-8 bytes and reject rewritten output before large allocation',()=>{
 const script=`const assert=require('node:assert/strict'),{previewBytes}=require('./src/preview-content'),{xmlDecoder}=require('./src/xml-preview');
 const decode=xmlDecoder([{declaration:'<!DOCTYPE svg [<!ENTITY x "'+('界'.repeat(1000))+'">]>'}]);
 assert.throws(()=>decode('&x;'.repeat(750)),/preview.*limit/i);
 const svg='<!DOCTYPE svg [<!ENTITY x \"'+('a,'.repeat(2048))+'\">]><svg srcset=\"'+('&x;'.repeat(1000))+'\"/>';
 const before=process.memoryUsage().rss;assert(previewBytes({kind:'asset',path:'art.svg',encoding:'base64',source:Buffer.from(svg).toString('base64')},'/preview/'+'a'.repeat(24)).length<16384);
 assert.equal(previewBytes({kind:'html',path:'index.html',source:'<b></b>'.repeat(20000)},'/preview/id').length,140000);
 const source='b:url(x);'.repeat(220000);
 assert.throws(()=>previewBytes({kind:'css',path:'a.css',source},'/preview/'+'a'.repeat(24)),/preview.*limit/i);
 assert(process.resourceUsage().maxRSS*1024-before<128*1024*1024,'preview memory growth exceeds 128 MiB');`;
 const result=spawnSync(process.execPath,['--max-old-space-size=128','-e',script],{cwd:root,timeout:3000,encoding:'utf8',maxBuffer:65536});assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stderr);
});

test('preview failures are cached per snapshot across query variants',()=>{
 bounded(`(async()=>{const assert=require('node:assert/strict'),cleanup=[];const o=require('./test/helpers').fixture({after:fn=>cleanup.push(fn)});const preview=require('./src/preview-content');let calls=0;preview.previewBytes=()=>{calls++;throw Error('preview output limit');};const app=require('./src/web-server').createCoordinator(o);try{await app.listen();const session=await require('./test/session-helper').previewSession(app);for(let i=0;i<10;i++)assert.equal((await fetch(session.url+'/index.html?'+i,{headers:session.headers})).status,400);assert.equal(calls,1);app.edit(require('./test/helpers').textOp(app.model,'Changed'));assert.equal((await fetch(session.url+'/index.html',{headers:session.headers})).status,400);assert.equal(calls,2);}finally{await app.close();for(const fn of cleanup.reverse())await fn();}})().catch(e=>{console.error(e);process.exitCode=1;});`);
});

test('HTML attributes decode legacy and numeric references without semicolons',()=>{
 const {parseAttrs}=require('../src/sanitize'),{previewBytes}=require('../src/preview-content');
 for(const [source,expected] of [['&copy 2024','© 2024'],['&#169','©'],['&#xA9','©'],['&#169x','©x'],['&copyé','©é'],['&copycat','&copycat'],['&copy=1','&copy=1'],['&notin','&notin'],['&notin;','∉'],['&hellip','&hellip'],['&amp;copy','&copy']]){
  assert.equal(parseAttrs(' title="'+source+'"')[0][1],expected,source);
  const body=previewBytes({kind:'html',path:'index.html',source:'<p title="'+source+'">Text</p>'},'/preview/id').toString();assert.equal(parseAttrs(body.slice(2,body.indexOf('>')))[0][1],expected,source);
 }
});

test('preview keeps dense legitimate pages and drops only oversize attributes with a notice',()=>{
 const {previewBytes}=require('../src/preview-content'),{MAX_FILE}=require('../src/web-import');const notices=[];
 const render=source=>previewBytes({kind:'html',path:'index.html',source},'/preview/id',{onNotice:message=>notices.push(message)}).toString();
 const list='<ul>'+'<li>x</li>'.repeat(11000)+'</ul>';assert(Buffer.byteLength(list)<MAX_FILE);assert.equal(render(list),list);
 const page='<h1>Kept</h1><img src="data:image/png;base64,'+'a'.repeat(70000)+'" alt="Kept image description"><p>After</p>';
 const body=render(page);assert(body.includes('<h1>Kept</h1>'));assert(body.includes('<img alt="Kept image description">'));assert(body.includes('<p>After</p>'));assert(notices.some(s=>s.includes('attribute')));
 const css=render('<p style="background:'+'url(x) '.repeat(8000)+'" title="kept">Text</p>');assert.equal(css,'<p title="kept">Text</p>');
});
