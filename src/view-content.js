'use strict';
const fs=require('node:fs'),path=require('node:path');
const {bytes,checkedPath,within,importSite,fingerprint}=require('./web-import'),{safePath}=require('./web-model');
const safe=require('./sanitize'),RX=require('./patterns'),caseless=require('./caseless-search');
const {cssRules}=require('./css-rules'),{inspectLease}=require('./state-lease'),{exportPreflight}=require('./web-publisher');
const MAX_ROWS=1000,SHOWN=400,CONTEXT=40;
// First differing UTF-16 index of two different lines, never inside a surrogate pair.
function firstDifference(a,b){
 const n=Math.min(a.length,b.length);let at=0;while(at<n&&a.charCodeAt(at)===b.charCodeAt(at))at++;
 if(at>0&&a.charCodeAt(at-1)>=0xd800&&a.charCodeAt(at-1)<=0xdbff)at--;
 return at;
}
// Bounded replacement rows. When the first changed line differs too far right for a 400-character row
// to show it, both sides of that line start just before the difference and name its line and column.
function diffRows(aSource,bSource,text){
 const rows=[],before=aSource.slice(0,65536).split('\n'),after=bSource.slice(0,65536).split('\n');let start=0;
 while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 const minus=before.slice(start,start+200).map(line=>'- '+text(line,SHOWN)),plus=after.slice(start,start+200).map(line=>'+ '+text(line,SHOWN));
 let notice='';
 if(start<before.length&&start<after.length){
  const a=before[start],b=after[start],at=firstDifference(a,b),where='line '+(start+1)+' col '+(at+1);
  if(at>=SHOWN-CONTEXT){
   let from=at-CONTEXT;if(a.charCodeAt(from)>=0xdc00&&a.charCodeAt(from)<=0xdfff)from--;
   minus[0]='- '+where+': …'+text(a.slice(from),SHOWN);plus[0]='+ '+where+': …'+text(b.slice(from),SHOWN);
  }
  if(minus[0].slice(1)===plus[0].slice(1))notice='Displayed rows match; the change at '+where+' is in hidden or control characters.';
 }
 rows.push(...minus,...plus);if(notice)rows.push(notice);
 if(start===before.length&&start===after.length)rows.push(aSource===bSource?'Text unchanged; only the stored encoding changed.':'No difference in the first 64 KiB; the change is beyond character 65536.');
 if(before.length-start>200||after.length-start>200||aSource.length>65536||bSource.length>65536)rows.push('Diff limit reached; unchanged prefixes may extend beyond this display.');
 return rows;
}
function changedFiles(before,after){
 const old=new Map(before.files.map(f=>[f.path,f])),now=new Map(after.files.map(f=>[f.path,f])),out=[];
 for(const name of [...new Set([...old.keys(),...now.keys()])].sort()){
  const a=old.get(name),b=now.get(name);
  if(a&&b&&a.source===b.source&&a.encoding===b.encoding)continue;
  out.push({name,a,b,kind:!a?'added':!b?'removed':'modified',delta:(b?bytes(b).length:0)-(a?bytes(a).length:0)});
 }
 return out;
}
function title(file){
 const node=file.nodes?.find(n=>n.selectorHint==='title');
 if(!node||!Number.isSafeInteger(node.openEnd)||!Number.isSafeInteger(node.closeStart))return '(untitled)';
 return safe.decodeAttribute(file.source.slice(node.openEnd,node.closeStart).slice(0,500))||'(untitled)';
}
function actor(h){return ['human','agent','system'].includes(h.actor)?h.actor:h.actor===undefined?(h.type==='open'?'system':['pause','resume','undo','redo','restore','delete_checkpoint','export'].includes(h.type)?'human':'agent'):'unknown';}
function label(c,index){return typeof c.label==='string'&&c.label===c.label.trim()&&c.label.length>0&&c.label.length<=80&&!RX.labelControls.test(c.label)&&!RX.systemLabel.test(c.label)?c.label:'Imported checkpoint '+(index+1);}
function historyTime(value){
 if(typeof value==='string'&&value.length===24){const time=Date.parse(value);if(Number.isFinite(time)&&new Date(time).toISOString()===value)return value;}
 return 'Time not recorded';
}
function historyRow(h,text){return 'r'+h.rev+' · '+historyTime(h.at)+' · '+actor(h)+' · '+text(h.type)+' · '+text(h.type==='checkpoint'?'Saved checkpoint':h.summary)+(h.label?' · '+text(label(h,0)):'');}
function leaseRow(dir){const lease=inspectLease(dir);return 'Server lease: '+lease.status+(lease.pid?' · PID '+lease.pid:'')+(lease.scopeMatches===false?' · scope mismatch':'');}
function unopenedDoctor({sourceRoot,dataRoot,exportRoot,unopened=true}){
 // Compare the same resolved folder identities used by storeSteps, including original-folder exports.
 sourceRoot=path.resolve(sourceRoot);dataRoot=path.resolve(dataRoot);if(exportRoot)exportRoot=path.resolve(exportRoot);
 const rows=[unopened?'Working copy not opened yet. This view creates nothing.':'Startup folder diagnostics; saved contents not inspected. This view creates nothing.','Node '+process.versions.node+' · requires 22+'];
 const install=path.resolve(__dirname,'..');
 const overlap=within(sourceRoot,dataRoot)||within(dataRoot,sourceRoot)||within(dataRoot,install)
  ||exportRoot&&(within(exportRoot,install)||within(exportRoot,dataRoot)||within(dataRoot,exportRoot)
    ||exportRoot!==sourceRoot&&(within(exportRoot,sourceRoot)||within(sourceRoot,exportRoot)));
 rows.push(overlap?'Startup blocked: configured folders overlap.':'Configured folder separation: valid.');
 try{checkedPath(sourceRoot);rows.push(fs.lstatSync(sourceRoot).isDirectory()?'Site folder: present.':'Site folder: not a directory.');}
 catch{rows.push('Site folder: missing or inaccessible; check paths and links.');}
 let stateSafe=false;
 try{
  checkedPath(dataRoot,{missing:true});
  if(!fs.existsSync(dataRoot))rows.push('State folder: not created; normal startup creates it.');
  else{
   const stat=fs.lstatSync(dataRoot);
   if(!stat.isDirectory())rows.push('State folder: not a directory.');
   else if(process.platform!=='win32'&&(stat.mode&0o077))rows.push('State folder: private permissions required (0700).');
   else if(!unopened){stateSafe=true;rows.push('State folder: private directory; saved contents not inspected.');}
   else{
    stateSafe=true;let other=0,metadata=0,seen=0,entry;const dir=fs.opendirSync(dataRoot);
    try{while((entry=dir.readSync())!==null&&seen++<1000){if(entry.name==='lease.json'||RX.leaseMetadata.test(entry.name))metadata++;else other++;}}
    finally{dir.closeSync();}
    rows.push(other||entry?'Startup blocked: state folder is non-empty; use a dedicated empty folder.':'State folder: dedicated empty folder, apart from permitted lease metadata.');
    rows.push('Lease metadata files: '+metadata+(entry?' (inspection limited to 1000 entries)':''));
   }
  }
 }catch{rows.push('State folder: inaccessible or linked; check configuration.');}
 if(stateSafe)rows.push(leaseRow(dataRoot));
 if(!exportRoot)rows.push('Export destination: not configured.');
 else try{checkedPath(exportRoot,{missing:true});const parent=checkedPath(path.dirname(exportRoot));rows.push(fs.lstatSync(parent).isDirectory()?'Export parent: present.':'Export parent: not a directory.');}
 catch{rows.push('Export parent: missing or inaccessible; check paths and links.');}
 rows.push('No repair is performed. Verify all writers on the original host/namespace before any manual lease removal; preserve working files and checkpoints.');
 return rows;
}
function cssReferences(source){
 const refs=[],lower=source.toLowerCase();let i=0;
 function quoted(){const q=source[i++],start=i;for(;i<source.length;i++){if(source[i]==='\\'){i++;continue;}if(source[i]===q)return source.slice(start,i++);}return source.slice(start,i);}
 while(i<source.length&&refs.length<1000){
  if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
  if(lower.startsWith('@import',i)){i+=7;while(RX.space.test(source[i]||'x'))i++;if(source[i]==='"'||source[i]==="'")refs.push(quoted());continue;}
  if(lower.startsWith('url(',i)){i+=4;while(RX.space.test(source[i]||'x'))i++;if(source[i]==='"'||source[i]==="'")refs.push(quoted());else{const start=i;while(i<source.length&&source[i]!==')')i++;refs.push(source.slice(start,i).trim());}continue;}
  if(source[i]==='"'||source[i]==="'"){quoted();continue;}i++;
 }
 return refs;
}
function referenceRows(model,allowExternal,text){
 const names=new Set(model.files.map(f=>f.path)),linked=new Set(),rows=[];let external=0,incomplete=false;
 function reference(from,value){
  if(rows.length>=990){incomplete=true;return;}
  if(!value||value.startsWith('#'))return;
  if(RX.absoluteReference.test(value)){external++;return;}
  try{
   if(value.includes('\\')){rows.push(text(from)+': escaped reference not checked');incomplete=true;return;}
   const url=new URL(value,'https://site-studio.invalid/'+from);let target=decodeURIComponent(url.pathname).slice(1);
   if(!target||target.endsWith('/'))target+='index.html';
   if(!safePath(target))throw Error('unsafe');
   if(names.has(target))linked.add(target);else rows.push(text(from)+': missing '+text(target));
  }catch{rows.push(text(from)+': unresolved local reference');incomplete=true;}
 }
 for(const f of model.files){
  if(rows.length>=990){incomplete=true;break;}
  if(f.kind==='css'){const refs=cssReferences(f.source);if(refs.length===1000)incomplete=true;for(const ref of refs)reference(f.path,ref);}
  if(f.kind!=='html')continue;
  try{
   let style=false;
   for(const token of safe.tokenize(f.source,{maxTokens:50000})){
    if(token.tag==='style')style=!token.closing;
    if(style&&token.text)for(const ref of cssReferences(token.text))reference(f.path,ref);
    if(!token.tag||token.closing)continue;
    try{for(const [name,value] of safe.parseAttrs(token.attrs||'')){
     if(['href','src'].includes(name))reference(f.path,value);
     if(name==='srcset')for(const entry of value.split(',').slice(0,1000))reference(f.path,entry.trim().split(RX.spaces)[0]);
     if(name==='style')for(const ref of cssReferences(value))reference(f.path,ref);
    }}catch{incomplete=true;}
   }
  }catch{rows.push(text(f.path)+': markup could not be fully checked');incomplete=true;}
 }
 rows.push('External references: '+external+' · '+(allowExternal?'allowed by policy; not fetched':'blocked in preview'));
 for(const f of model.files)if(f.kind==='html'&&!linked.has(f.path))rows.push('No local inbound link: '+text(f.path));
 rows.unshift('Static reference check; no network, fragment-ID checks, or browser parsing. SVG/assets and escaped CSS may need manual review.');
 if(incomplete)rows.push('Check incomplete: a parsing or result limit was reached.');
 return rows;
}
function project({state:s,sourceRoot,dataRoot,exportRoot,stateBytes,view,args=[],assets=false},text){
 const rows=[],model=s.model;
 if(view==='home'){
  const counts=['html','css','text','asset'].map(k=>k+': '+model.files.filter(f=>f.kind===k).length).join(' · ');
  rows.push('Working copy r'+model.rev+' · '+(s.paused?'Editing paused':'Editing enabled'),model.files.length+' files · '+counts,
   'Undo: '+s.undo.length+' · Redo: '+s.redo.length+' · Checkpoints: '+s.checkpoints.length+'/10',
   'State: '+(stateBytes*0.00000095367431640625).toFixed(2)+' MiB · history target 96 MiB / ceiling 128 MiB',leaseRow(dataRoot),
   'External references: '+(s.allowExternal?'allowed':'blocked')+' · export destination '+(exportRoot?'configured':'disabled'),
   'Changes from opened original: '+changedFiles(s.openedModel,model).length+' files',
   'Current revision exported: '+(s.history.some(h=>h.type==='export'&&h.rev===model.rev)?'yes (retained history)':'not recorded'),
   'Site folder: '+text(path.basename(sourceRoot))+' · State folder: '+text(path.basename(dataRoot)),
   ...s.history.slice(-3).map(h=>historyRow(h,text)));
 }
 if(view==='pages')for(const f of model.files)if(assets||f.kind==='html')rows.push(text(f.path)+' · '+f.kind+' · '+bytes(f).length+' bytes'+(f.kind==='html'?' · '+text(title(f))+' · '+f.nodes.length+' nodes':''));
 if(view==='page'){
  if(args.length!==1)throw Error('VIEW_ARGUMENTS');const f=model.files.find(f=>f.path===args[0]);if(!f)throw Error('VIEW_NOT_FOUND');
  rows.push(text(f.path)+' · '+f.kind+' · '+bytes(f).length+' bytes');
  if(f.kind==='html'){rows.push('Title: '+text(title(f)));for(const n of f.nodes.slice(0,200))rows.push(text(n.id)+' · '+text(n.selectorHint)+' · chars '+n.range.join('–'));if(f.nodes.length>200)rows.push('Outline limited to 200 nodes.');}
  if(f.kind==='css'){let n=0;for(const rule of cssRules(f.source)){if(n++===200){rows.push('CSS list limited to 200 rules.');break;}rows.push('Rule: '+text(rule.selector)+' · '+text(rule.declarations));}}
  if(f.kind==='asset')rows.push('Opaque asset; body withheld.');
  else for(let start=0;start<f.source.length&&rows.length<MAX_ROWS;start+=400)rows.push('chars '+start+'–'+Math.min(start+400,f.source.length)+': '+text(f.source.slice(start,start+400),400));
  if(rows.length===MAX_ROWS)rows[MAX_ROWS-1]='Source display limit reached. Use web_read for another bounded range.';
 }
 if(view==='find'){
  const query=args.join(' ');if(!query||query.length>8192)throw Error('VIEW_ARGUMENTS');const folded=caseless.fold(query);
  for(const f of model.files){if(rows.length===100)break;if(f.kind==='asset')continue;let cursor=0,line=1;
   for(const hit of caseless.search(f.source,folded,100-rows.length)){while(cursor<hit.offset)if(f.source[cursor++]==='\n')line++;rows.push(text(f.path)+' · line '+line+' · char '+hit.offset+' · '+text(hit.context));}
  }
  if(rows.length===100)rows.push('Match limit reached (100). Narrow the query.');
 }
 if(view==='history')for(const h of s.history.slice().reverse())rows.push(historyRow(h,text));
 if(view==='checkpoints'){
  rows.push('Opened working copy · r0 · system · permanent · '+changedFiles(s.openedModel,model).length+' changed files');
  s.checkpoints.forEach((c,i)=>rows.push(text(label(c,i))+' · r'+c.model.rev+' · '+actor(c)+' · '+changedFiles(c.model,model).length+' changed files'));
  rows.push('Restore and delete are human dashboard controls.');
 }
 if(view==='changes'){
  if(args.length>2)throw Error('VIEW_ARGUMENTS');const latest=s.checkpoints.at(-1);
  const target=args[0]==='original'?s.openedModel:args[0]?s.checkpoints.find((c,i)=>label(c,i)===args[0])?.model:latest?.model||s.openedModel;
  if(!target)throw Error('VIEW_NOT_FOUND');const changes=changedFiles(target,model);
  // Name the baseline: the default is the latest checkpoint, so an empty list must not read as "nothing changed".
  const since=target===s.openedModel?'the opened original (r0)':'checkpoint '+text(args[0]||label(latest,s.checkpoints.length-1))+' (r'+target.rev+')';
  const hint=!args[0]&&latest?' Default baseline is the latest checkpoint; use `changes original` for the opened original.':'';
  if(!args[1]){
   rows.push((changes.length?changes.length+(changes.length===1?' changed file since ':' changed files since '):'No changes since ')+since+'.'+hint);
   for(const c of changes)rows.push(c.kind+' '+text(c.name)+' · '+(c.delta>=0?'+':'')+c.delta+' bytes');
  }else{
   const c=changes.find(c=>c.name===args[1]);if(!c)rows.push('No recorded change for this file since '+since+'.'+hint);
   else if(c.a?.kind==='asset'||c.b?.kind==='asset')rows.push('Asset '+text(c.name)+' changed; body withheld.');
   else{
    rows.push('Bounded line replacement diff; not a minimal diff. At most 200 lines per side, first 64 KiB per file.');
    rows.push(...diffRows(c.a?.source||'',c.b?.source||'',text));
   }
  }
 }
 if(view==='check')rows.push(...referenceRows(model,s.allowExternal,text));
 if(view==='dashboard'||view==='preview')rows.push(leaseRow(dataRoot),
  'The human opens the private dashboard link before giving the agent work.',
  'Claude Code Linux logs: ~/.cache/claude-cli-nodejs/<cwd-slug>/mcp-logs-plugin-toolsenabled-site-studio-site-studio/<timestamp>.jsonl',
  'Direct registration uses mcp-logs-site-studio; other hosts: docs/CLAUDE-INSTALL.md.',
  'Find "Site Studio dashboard session:" privately. This view never reads logs or access links.',
  'Dashboard-only: pause/resume, undo/redo, restore/delete checkpoint, export and Refresh preview.',
  'Renew dashboard session keeps this tab signed in; Move to another browser revokes old access.',
  'Lost access: stop the MCP connection, verify it exited, restart and open the newest link.');
 if(view==='export'){
  const p=exportPreflight({sourceRoot,dataRoot,exportRoot,originalFingerprint:s.originalFingerprint});
  rows.push(p.configured?(p.ready?'Ready for human review (advisory; rechecked on export).':'Export readiness: blocked or unverifiable.'):'Export disabled: no destination. The Codex plugin does not configure one.',
   'Destination: '+(p.configured?'configured folder (absolute path withheld)':'not configured'),
   'Safe paths: '+p.pathsSafe+' · Parent exists: '+p.parentExists+' · Destination exists: '+p.destinationExists,
   'Export lock: '+(p.lockPresent===null?'unknown':p.lockPresent?'present; owner unverified, never remove automatically':'absent'),
   'Original drift: '+(p.originalDrift===null?'unverifiable':p.originalDrift?'detected':'none'),
   'Current revision exported: '+(s.history.some(h=>h.type==='export'&&h.rev===model.rev)?'yes (retained history)':'not recorded'),
   'The human chooses Export working copy, then Confirm export in the authenticated dashboard.',
   'No export is performed here. Existing destinations refuse unless replacing the original with a backup.');
 }
 if(view==='doctor'){
  rows.push('Node '+process.versions.node+' · requires 22+', 'Site and state paths: absolute, separate; saved-state binding verified.',
   'Saved state: version 1, regular, single link, within 128 MiB; external policy matches.',
   'State folder: '+(process.platform==='win32'?'check account ACL manually':'private permissions verified'),leaseRow(dataRoot));
  const p=exportPreflight({sourceRoot,dataRoot,exportRoot,originalFingerprint:s.originalFingerprint});
  // A successful export preflight already re-imported the source. Otherwise run the same bounded,
  // read-only import as startup, including when export is disabled or its paths could not be checked.
  let drift=p.originalDrift,sourceStatus='passed current static-site limits (read-only).';
  if(drift===null)try{drift=fingerprint(importSite(sourceRoot))!==s.originalFingerprint;}
  catch(e){sourceStatus=e.code&&e.code!=='ERR_ENCODING_INVALID_ENCODED_DATA'
   ?'could not be checked; filesystem access failed.'
   :'refused by static-site validation; check regular single-link files, safe paths, UTF-8 and size/count limits.';}
  rows.push('Source import: '+sourceStatus,'Original drift: '+(drift===null?'unverifiable':drift?'detected':'none'),
   'Source import limits: 2 MiB per file, 32 MiB total, 1000 files and 1000 directories.',
   p.configured?'Export paths safe: '+p.pathsSafe+' · parent present: '+p.parentExists:'Export destination: not configured.');
  const leftovers=fs.readdirSync(dataRoot).filter(n=>RX.leaseMetadata.test(n));rows.push('Lease temporary/recovery files: '+leftovers.length+' (not changed).');
  rows.push('Dead owners recover at normal startup only within the same host/platform/PID namespace.',
   'For unavailable identity or changed Mac hostname: verify ALL writers stopped on the original host/namespace before manually removing only lease.json. Preserve working files and checkpoints.',
   'No repair is performed. State needs local hard links; Windows needs SystemRoot and PowerShell; macOS needs /bin/ps.');
 }
 return rows.length>MAX_ROWS?[...rows.slice(0,MAX_ROWS-1),'Display limit reached; narrow the request.']:rows;
}
module.exports={project,changedFiles,unopenedDoctor,MAX_ROWS};
