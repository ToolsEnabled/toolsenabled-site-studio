'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {absolutePath}=require('./options');
const os=require('node:os'),{hash,validateModel}=require('./web-model');
const {checkedPath,within}=require('./web-import');
const native=require('./native-filesystem');
const MAX_STATE=128*1024*1024;
function fail(code){throw Error(code);}
function readSnapshot(sourceRoot,dataRoot,allowExternal){
 let file,fd;
 try{
  sourceRoot=checkedPath(absolutePath(sourceRoot,'site'));dataRoot=checkedPath(absolutePath(dataRoot,'state'));
  if(!fs.lstatSync(sourceRoot).isDirectory())fail('VIEW_STATE');
  if(within(sourceRoot,dataRoot)||within(dataRoot,sourceRoot)||within(dataRoot,path.resolve(__dirname,'..')))fail('VIEW_STATE');
  const dir=fs.lstatSync(dataRoot);if(!dir.isDirectory()||process.platform!=='win32'&&(dir.mode&0o077))fail('VIEW_STATE');
  native.privateDirectory(dataRoot,{existing:true,tree:true});
  file=checkedPath(path.join(dataRoot,'state.json'));
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  const before=fs.fstatSync(fd);
  if(!before.isFile()||before.nlink!==1||before.size>MAX_STATE)fail('VIEW_STATE');
  const buffer=Buffer.alloc(before.size);let offset=0;
  while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,buffer.length-offset,offset);if(!n)fail('VIEW_STATE');offset+=n;}
  const after=fs.fstatSync(fd);
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)fail('VIEW_CHANGED');
  const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  if(state.sourceRoot!==sourceRoot)fail('VIEW_BINDING');
  if(state.allowExternal!==allowExternal)fail('VIEW_POLICY');
  if(state.fingerprintVersion!==2||!state.openedModel)fail('VIEW_UPGRADE');
  if(state.version!==1||!Number.isSafeInteger(state.model?.rev)||state.model.rev<0||typeof state.paused!=='boolean'
    ||!Array.isArray(state.model.files)||state.model.files.length>1000||!Array.isArray(state.history)||state.history.length>100
    ||!Array.isArray(state.checkpoints)||state.checkpoints.length>10)fail('VIEW_STATE');
  if(!Array.isArray(state.undo)||state.undo.length>20||!Array.isArray(state.redo)||state.redo.length>20)fail('VIEW_STATE');
  validateModel(state.model);validateModel(state.openedModel);for(const cp of state.checkpoints)validateModel(cp.model);
  return {state,stateBytes:before.size,snapshot:crypto.createHash('sha256').update(buffer).digest('hex')};
 }catch(e){if(['VIEW_BINDING','VIEW_CHANGED','VIEW_POLICY','VIEW_UPGRADE'].includes(e.message))throw e;if(e.code==='ENOENT')return {state:null,stateBytes:0,snapshot:hash('not-opened').slice(7)};fail('VIEW_STATE');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
async function view(options){
 const {VIEWS,LIMIT,HELP,safeText,snapshotId,parsePage}=await import('../hooks/view-contract.mjs');
 const {view='home',offset=0,snapshot,args=[],assets=false,allowExternal=false}=options;
 if(!VIEWS.includes(view)||!Number.isSafeInteger(offset)||offset<0||offset>1000||offset%LIMIT!==0
    ||snapshot!==undefined&&!snapshotId(snapshot)||offset>0&&!snapshot||!Array.isArray(args)||args.length>2
    ||args.some(v=>typeof v!=='string'||v.length>8192)||typeof allowExternal!=='boolean')fail('VIEW_ARGUMENTS');
 const sourceRoot=options.sourceRoot??process.env.SITE_STUDIO_ROOT??path.join(__dirname,'../site');
 // The server hashes the resolved site path (studio-store.js), so a trailing separator names the same folder.
 const dataRoot=options.dataRoot??process.env.SITE_STUDIO_DATA??native.defaultDataRoot(hash(native.pathKey(checkedPath(String(sourceRoot),{missing:true}))).slice(7,23));
 const exportRoot=options.exportRoot;
 try{absolutePath(sourceRoot,'site');absolutePath(dataRoot,'state');if(exportRoot!==undefined)absolutePath(exportRoot,'export');}catch{fail('VIEW_CONFIG');}
 if(!['page','find','changes'].includes(view)&&args.length)fail('VIEW_ARGUMENTS');
 let result,rows;
 if(view==='help'){rows=HELP;result={snapshot:hash('help').slice(7),state:null};}
 else{
  try{result=readSnapshot(sourceRoot,dataRoot,allowExternal);}
  catch(e){
   if(view!=='doctor')throw e;
   const details={VIEW_UPGRADE:'Open once with Site Studio to upgrade saved state.',VIEW_POLICY:'External-reference policy mismatch; select matching startup options.',VIEW_BINDING:'Saved state belongs to another configured site.',VIEW_STATE:'Saved state or path validation failed; check folders, permissions, links and 128 MiB ceiling.'};
   rows=[details[e.message]||'Saved state unavailable.',
    ...require('./view-content').unopenedDoctor({sourceRoot,dataRoot,exportRoot,unopened:false}),
    'Check that site/state/export/install folders do not overlap; all paths must be absolute.',
    'Verify all writers on the original host and PID namespace have stopped before any manual lease removal.',
    'Preserve state.json, working directories and checkpoints. No repair is performed.'];
   result={snapshot:hash(e.message).slice(7),state:null};
  }
  if(!rows)rows=result.state?require('./view-content').project({...options,sourceRoot:checkedPath(sourceRoot),dataRoot:checkedPath(dataRoot),exportRoot,state:result.state,stateBytes:result.stateBytes,view,args,assets},(value,n=160)=>safeText(value,n))
   :view==='doctor'?require('./view-content').unopenedDoctor({sourceRoot,dataRoot,exportRoot})
   :['Working copy not opened yet. Start the configured Site Studio MCP connection once; this view creates nothing.'];
 }
 rows=rows.map(row=>safeText(row,750));
 const pin=hash(result.snapshot+JSON.stringify({view,args,assets,rows})).slice(7);
 if(snapshot!==undefined&&snapshot!==pin)fail('VIEW_CHANGED');
 if(offset>0&&offset>=rows.length)fail('VIEW_ARGUMENTS');
 return parsePage({schema:'site-studio/view/1',view,rev:result.state?.model.rev??0,snapshot:pin,offset,limit:LIMIT,total:rows.length,
  rows:rows.slice(offset,offset+LIMIT),nextOffset:offset+LIMIT<rows.length?offset+LIMIT:null},view,offset,snapshot);
}
module.exports={view};
