'use strict';
const {absolutePath}=require('./options');
const RX=require('./patterns');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const os=require('node:os');
const {applyOp,validateModel,hash}=require('./web-model');
const {MAX_SITE,MAX_FILE,MAX_FILES,allDirectories,checkedPath,importSiteSteps,bytes,fingerprint,within,writeTree}=require('./web-import');
const {exportSite}=require('./web-publisher');
const native=require('./native-filesystem');
const OPENED='Opened working copy (r0)';
function validLabel(label){return typeof label==='string'&&label===label.trim()&&label.length>0&&label.length<=80&&!RX.labelControls.test(label)&&!RX.systemLabel.test(label);}
// The rename commits the new state. A later directory-sync error must
// never be reported as a rejected edit or trigger deletion of the live tree.
function atomicJson(file,value) {
  const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try {
    const fd=fs.openSync(temp,'wx',0o600);
    try {fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(temp,file);
  } finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
  if(process.platform!=='win32') {
    let dir;
    try {dir=fs.openSync(path.dirname(file),'r');fs.fsyncSync(dir);}
    catch(e) {return 'State saved; directory sync unavailable ('+(e.code||'I/O error')+').';}
    finally {if(dir!==undefined)fs.closeSync(dir);}
  }
  return null;
}
// A first start killed during its first commit (SIGKILL, OOM, power loss) can leave working-<hex>, the copy of the site
// it was writing, and state.json.<hex>.tmp, the state it was writing; state.json itself never appeared. With no
// state.json, startup removes such names only when each working folder holds nothing but a copy, possibly partial, of
// the original just imported and each temporary state is incomplete or the untouched opened state. Anything else is
// refused as before, so nothing that holds edits or other content is removed.
function siteCopy(root,rel,files,directories){
  for(const entry of fs.readdirSync(path.join(root,rel))){
    const relative=rel?rel+'/'+entry:entry,file=path.join(root,relative),st=fs.lstatSync(file);
    if(st.isDirectory()){if(!directories.has(relative)||!siteCopy(root,relative,files,directories))return false;continue;}
    const want=files.get(relative);if(!st.isFile()||!want||st.size>want.length||!fs.readFileSync(file).equals(want.subarray(0,st.size)))return false;
  }
  return true;
}
function openedStateOnly(file,st){
  if(st.size>128*1024*1024)return false;
  let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return true;}
  return saved?.model?.rev===0&&Array.isArray(saved.undo)&&!saved.undo.length&&Array.isArray(saved.redo)&&!saved.redo.length&&Array.isArray(saved.checkpoints)&&!saved.checkpoints.length;
}
function firstStartLeftovers(dataRoot,imported){
  const files=new Map(imported.files.map(f=>[f.path,bytes(f)])),directories=new Set(allDirectories(imported)),found=[];
  for(const name of fs.readdirSync(dataRoot).sort()){
    if(name==='lease.json'||RX.leaseMetadata.test(name))continue;
    const file=path.join(dataRoot,name),st=fs.lstatSync(file);
    if(RX.generation.test(name)&&st.isDirectory()&&siteCopy(file,'',files,directories))found.push(name);
    else if(RX.stateTemp.test(name)&&st.isFile()&&st.nlink===1&&openedStateOnly(file,st))found.push(name);
    else throw Error('state root must be an empty dedicated directory');
  }
  return found;
}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function* storeSteps(options={}) {
  const allowed=new Set(['sourceRoot','dataRoot','exportRoot','port','host','allowExternal']);for(const key of Object.keys(options))if(!allowed.has(key))throw Error('unknown option: '+key);
  const sourceRoot=checkedPath(absolutePath(options.sourceRoot??process.env.SITE_STUDIO_ROOT??path.join(__dirname,'../site'),'site directory'));
  native.inspectWindowsPath(sourceRoot,{tree:true});
  const dataRoot=checkedPath(absolutePath(options.dataRoot??process.env.SITE_STUDIO_DATA??native.defaultDataRoot(hash(native.pathKey(sourceRoot)).slice(7,23)),'state directory'),{missing:true});
  const exportRoot=options.exportRoot===undefined?null:checkedPath(absolutePath(options.exportRoot,'export directory'),{missing:true});
  const installRoot=fs.realpathSync(path.join(__dirname,'..'));
  if(within(dataRoot,installRoot)||exportRoot&&within(exportRoot,installRoot))throw Error('state and export folders must be outside the plugin installation');
  if(within(sourceRoot,dataRoot)||within(dataRoot,sourceRoot))throw Error('source and state roots must not overlap');
  if(exportRoot&&(within(exportRoot,dataRoot)||within(dataRoot,exportRoot)||exportRoot!==sourceRoot&&(within(exportRoot,sourceRoot)||within(sourceRoot,exportRoot))))throw Error('overlapping export root refused');
  // Site Studio never creates the export parent, so a missing one is refused here before any state exists. An existing
  // destination is rechecked when the human confirms export, which keeps a restart after an export working.
  if(exportRoot){let parent;try{parent=fs.statSync(path.dirname(exportRoot));}catch(e){if(e.code!=='ENOENT')throw e;throw Error('export parent folder must already exist; create it or choose another --export-dir');}if(!parent.isDirectory())throw Error('export parent must be a directory');}
  native.privateDirectory(dataRoot);checkedPath(dataRoot);native.privateDirectory(dataRoot,{existing:true,tree:true});
  const releaseLease=require('./state-lease').acquireLease(dataRoot);
  let closed=false,handedOff=false,durabilityWarning=null,undoPruned=null;
  function release(){if(closed)return;closed=true;releaseLease();}
  try {
    const statePath=path.join(dataRoot,'state.json');let state,snapshot;
    const policy={allowExternal:options.allowExternal===true};
    // Validate the original on every start, even when resuming a persisted copy.
    const imported=yield* importSiteSteps(sourceRoot);
    if(fs.existsSync(statePath)){checkedPath(statePath);const s=fs.lstatSync(statePath);if(!s.isFile()||s.nlink!==1||s.size>128*1024*1024)throw Error('invalid state file');state=JSON.parse(fs.readFileSync(statePath,'utf8'));if(state.version!==1||state.sourceRoot!==sourceRoot||state.allowExternal!==policy.allowExternal)throw Error('state belongs to another site or external-reference policy'); validateModel(state.model);}
    else {
      const leftovers=firstStartLeftovers(dataRoot,imported);
      if(leftovers.length){for(const name of leftovers)fs.rmSync(path.join(dataRoot,name),{recursive:true});process.stderr.write('Removed '+leftovers.length+' leftover'+(leftovers.length===1?'':'s')+' of an interrupted first start from the state folder: '+leftovers.join(', ')+'.\n');}
      state={version:1,fingerprintVersion:2,sourceRoot,allowExternal:policy.allowExternal,originalFingerprint:fingerprint(imported),model:imported,openedModel:imported,paused:false,undo:[],redo:[],checkpoints:[],history:[{rev:0,at:new Date().toISOString(),actor:'system',type:'open',summary:'Opened working copy'}],generation:null};}
    if(state.fingerprintVersion!==2){state.originalFingerprint=require('./fingerprint-migration').migrateFingerprint(state,imported);state.fingerprintVersion=2;}
    if(!state.openedModel){
      state.openedModel=[state.model,...state.undo,...state.redo,...state.checkpoints.map(c=>c.model)].find(m=>m.rev===0);
      if(!state.openedModel)throw Error('Saved state has no initial restore target. Recover the working copy before opening a new state directory.');
    }
    validateModel(state.openedModel);
    for(const cp of state.checkpoints){cp.actor??='agent';if(!validLabel(cp.label))cp.label='Imported checkpoint '+(state.checkpoints.indexOf(cp)+1);}
    for(const item of state.history){
      item.actor??=item.type==='open'?'system':['pause','resume','undo','redo','restore','delete_checkpoint','export'].includes(item.type)?'human':'agent';
      if(item.type==='checkpoint'&&item.summary!=='Saved checkpoint'){item.label=validLabel(item.summary)?item.summary:'Imported checkpoint';item.summary='Saved checkpoint';}
    }
    function bounds(next) {
      validateModel(next.model);let total=0;for(const f of next.model.files){const size=bytes(f).length;if(size>MAX_FILE)throw Error('file exceeds 2 MiB limit');total+=size;}if(total>MAX_SITE||next.model.files.length>MAX_FILES||allDirectories(next.model).length>MAX_FILES)throw Error('site size limit');
      next.undo=next.undo.slice(-20);next.redo=next.redo.slice(-20);next.history=next.history.slice(-100);
      // Older undo/redo states give way to the 96 MiB history target, but the newest undo and the newest redo state
      // stay: each is a full copy of the site, and on a large site the newest one is the only Undo the human has.
      // Only the 128 MiB state ceiling removes them (redo first), and the result then says so in undoPruned.
      const size=()=>Buffer.byteLength(JSON.stringify(next)),lost=[];
      while(size()>96*1024*1024&&(next.undo.length>1||next.redo.length>1)){if(next.undo.length>1)next.undo.shift();else next.redo.shift();}
      while(size()>128*1024*1024&&(next.undo.length||next.redo.length)){if(next.redo.length){next.redo.shift();lost.push('redo');}else{next.undo.shift();lost.push('undo');}}
      if(size()>128*1024*1024)throw Error('history budget exceeded; remove checkpoints in the dashboard');
      if(!lost.length)return null;
      const kinds=lost.includes('undo')&&lost.includes('redo')?'undo and redo states':lost.includes('undo')?'undo state':'redo state';
      return 'Saved, but the 128 MiB state limit removed the newest '+kinds+'. Restore a checkpoint or the opened working copy (r0) to go back, or delete a checkpoint to keep Undo.';
    }
    function commit(next,materialize=true) {
      const pruned=bounds(next);checkedPath(dataRoot);let generation;
      if(materialize){generation='working-'+crypto.randomBytes(16).toString('hex');writeTree(path.join(dataRoot,generation),next.model);next.generation=generation;}
      try{durabilityWarning=atomicJson(statePath,next);}catch(e){if(generation)fs.rmSync(path.join(dataRoot,generation),{recursive:true});throw e;}
      state=next;undoPruned=pruned;snapshot=freeze(structuredClone(state.model));
      // Only exact names generated by this product inside its private directory.
      try {for(const n of fs.readdirSync(dataRoot))if(RX.generation.test(n)&&n!==state.generation){const p=path.join(dataRoot,n);if(fs.lstatSync(p).isDirectory())fs.rmSync(p,{recursive:true});}} catch(e){durabilityWarning='State saved; obsolete working copy cleanup failed.';}
    }
    yield;
    commit(structuredClone(state));
    yield;
    function notes(){return {...(durabilityWarning?{durabilityWarning}:{}),...(undoPruned?{undoPruned}:{})};}
    function assertRev(rev){if(closed)throw Error('coordinator closed');if(!Number.isInteger(rev)||rev!==state.model.rev)throw Error('stale revision');}
    function record(next,type,summary,actor='agent',label){next.history.push({rev:next.model.rev,at:new Date().toISOString(),actor,type,summary,...(label?{label}:{})});}
    function edit(op){assertRev(op?.expectedRev);if(state.paused)throw Error('editing is paused');const next=structuredClone(state);next.model=applyOp(state.model,op,policy);next.undo.push(state.model);next.redo=[];const names={set_text:'Updated text',set_attr:'Updated attribute',remove_attr:'Removed attribute',css_rule_set:'Updated style',css_rule_remove:'Removed style',insert_element:'Inserted element',insert_section:'Inserted section',remove_element:'Removed element',move_element:'Moved element',add_page:'Added page',add_asset:'Added drawing'};record(next,op.type,names[op.type]+' · '+(op.path||state.model.files.find(f=>f.id===op.fileId)?.path||'site'));commit(next);return {rev:state.model.rev,...notes()};}
    function checkpoint(label,rev,actor='agent'){assertRev(rev);if(state.paused&&actor==='agent')throw Error('editing is paused');if(!validLabel(label))throw Error('invalid checkpoint label');if(state.checkpoints.length>=10||state.checkpoints.some(c=>c.label===label))throw Error('checkpoint limit or duplicate label');const next=structuredClone(state);next.checkpoints.push({label,actor,model:state.model});record(next,'checkpoint','Saved checkpoint',actor,label);commit(next,false);return {rev:state.model.rev,label,...notes()};}
    function human(action,args={}) {
      assertRev(args.expectedRev);const allowed={pause:[],resume:[],undo:[],redo:[],restore:['label'],checkpoint:['label'],delete_checkpoint:['label'],export:['confirmed']}[action];if(!allowed)throw Error('unknown control');for(const key of Object.keys(args))if(!['expectedRev',...allowed].includes(key))throw Error('unknown control field: '+key);
      if(action==='checkpoint')return checkpoint(args.label,args.expectedRev,'human');
      if(action==='export') {
        if(args.confirmed!==true)throw Error('export requires human confirmation');
        const receipt=exportSite({sourceRoot,dataRoot,exportRoot,originalFingerprint:state.originalFingerprint,model:state.model,onExport(receipt) {
          const next=structuredClone(state);
          next.originalFingerprint=receipt.originalFingerprint;
          record(next,'export','Exported '+receipt.files+' files'+(receipt.backup?' (original backup retained)':''),'human');
          commit(next,false);
        }});
        return {rev:state.model.rev,...receipt,...notes()};
      }
      const next=structuredClone(state);
      if(action==='pause'||action==='resume')next.paused=action==='pause';
      else if(action==='delete_checkpoint'){if(args.label===OPENED)throw Error('initial restore target is permanent');const index=next.checkpoints.findIndex(c=>c.label===args.label);if(index<0)throw Error('checkpoint not found');next.checkpoints.splice(index,1);}
      else {
        let target;
        if(action==='restore'){target=args.label===OPENED?next.openedModel:next.checkpoints.find(c=>c.label===args.label)?.model;if(!target)throw Error('checkpoint not found');next.undo.push(state.model);next.redo=[];}
        else {const from=action==='undo'?next.undo:next.redo,to=action==='undo'?next.redo:next.undo;if(!from.length)throw Error('nothing to '+action);target=from.pop();to.push(state.model);}
        next.model=structuredClone(target);next.model.rev=state.model.rev+1;
      }
      record(next,action,({pause:'Paused editing',resume:'Resumed editing',undo:'Undid last edit',redo:'Redid last edit',restore:'Restored checkpoint',delete_checkpoint:'Deleted checkpoint'}[action]),'human',args.label);commit(next,!['pause','resume','delete_checkpoint'].includes(action));return {rev:state.model.rev,...notes()};
    }
    handedOff=true;
    return {edit,checkpoint,human,close:release,get snapshot(){return snapshot;},get model(){return structuredClone(state.model);},get workingRoot(){return path.join(dataRoot,state.generation);},get status(){return {durabilityWarning,undoPruned,rev:state.model.rev,paused:state.paused,undo:state.undo.length,redo:state.redo.length,checkpoints:[{label:OPENED,rev:0,actor:'system',type:'open',permanent:true},...state.checkpoints.map(c=>({label:c.label,rev:c.model.rev,actor:c.actor,type:'checkpoint'}))],history:state.history,exportConfigured:!!exportRoot,exportDestination:exportRoot,allowExternal:policy.allowExternal};}};
  } finally {if(!handedOff)release();}
}
function createStore(options){const steps=storeSteps(options);for(;;){const r=steps.next();if(r.done)return r.value;}}
async function createStoreAsync(options,signal){
 const steps=storeSteps(options);
 try{for(;;){signal?.throwIfAborted();const r=steps.next();if(r.done)return r.value;await new Promise(resolve=>setImmediate(resolve));}}
 finally{steps.return();}
}
module.exports={createStore,createStoreAsync};
