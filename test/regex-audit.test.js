'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');const RX=require('../src/patterns');const root=path.join(__dirname,'..');
function checkSource(source,file){
 let i=0;
 function quoted(q){while(i<source.length){const c=source[i++];if(c==='\\'){i++;continue;}if(c===q)return;if(q==='`'&&c==='$'&&source[i]==='{'){i++;code(true);}}}
 function code(nested=false){while(i<source.length){const c=source[i++];if(c==='}'&&nested)return;if(c==='{'){code(true);continue;}if(c==='"'||c==="'"||c==='`'){quoted(c);continue;}
  if(c==='/'){if(source[i]==='/'){const at=source.indexOf('\n',i+1);i=at<0?source.length:at+1;}else if(source[i]==='*'){const at=source.indexOf('*/',i+1);assert(at>=0);i=at+2;}else assert.fail(file+': register regex in src/patterns.js instead of a slash expression');}
  if(/[a-z_$]/i.test(c)){let word=c;while(i<source.length&&/[\w$]/.test(source[i]))word+=source[i++];assert(!['RegExp','eval','Function'].includes(word),file+': dynamic pattern construction is outside the audited inventory');}
 }}
 if(source.startsWith('#!'))i=source.indexOf('\n')+1;code();
}
test('all runtime regexes belong to the timed inventory',()=>{
 const files=['mcp-web.js','web-server.js','web-guard.js',...['src','public','tools'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.js')||n.endsWith('.mjs')||n.endsWith('.cjs')).map(n=>dir+'/'+n))].filter(n=>n!=='src/patterns.js');
 for(const file of files)checkSource(fs.readFileSync(path.join(root,file),'utf8'),file);
 assert.throws(()=>checkSource('const x=`${ /bad/.test(input) }`;','fixture'));
});
for(const name of Object.keys(RX))test('regex '+name+' stays within its adversarial time budget',()=>{
 const r=spawnSync(process.execPath,[path.join(__dirname,'regex-worker.js'),name],{cwd:root,encoding:'utf8',timeout:3000});assert.equal(r.error,undefined,name+': '+r.error?.message);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).shapes,22);
});
