'use strict';
const RX=require('./patterns');
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {hash,indexHtml,validateModel,safePath}=require('./web-model');
const native=require('./native-filesystem');
const MAX_FILE=2*1024*1024,MAX_SITE=32*1024*1024,MAX_FILES=1000;
function checkedPath(value,{missing=false}={}) {
  if(process.platform==='win32')native.windowsLocalPath(value);
  const resolved=path.resolve(value); const parsed=path.parse(resolved); let current=parsed.root;
  let existing=parsed.root;const absent=[];
  for(const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part); let st;
    try{st=fs.lstatSync(current);}catch(e){if(e.code==='ENOENT'&&missing){absent.push(part);continue;}throw e;}
    if(st.isSymbolicLink())throw Error('symbolic link refused');
    existing=current;
  }
  // On Windows realpath expands existing case/8.3 spellings before comparing
  // roots or deriving a cooperating export lock. Missing suffixes stay lexical.
  return process.platform==='win32'?path.join(fs.realpathSync.native(existing),...absent):resolved;
}
function readRegular(filename) {
  checkedPath(filename); if(!fs.lstatSync(filename).isFile())throw Error('special file refused: only regular files are supported'); const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {const s=fs.fstatSync(fd); if(!s.isFile()||s.nlink!==1)throw Error('non-regular file or hard link refused'); if(s.size>MAX_FILE)throw Error('file exceeds 2 MiB limit'); return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function* importSiteSteps(root) {
  root=checkedPath(root); if(!fs.statSync(root).isDirectory())throw Error('site root must be a directory');
  const files=[],directories=[]; let size=0;
  function* visit(rel='') {
    for(const entry of fs.readdirSync(path.join(root,rel)).sort()) {
      yield;
      const relative=rel?rel+'/'+entry:entry; if(!safePath(relative))throw Error('unsafe site path: '+relative);
      const file=path.join(root,relative); const st=fs.lstatSync(file); if(st.isSymbolicLink())throw Error('symbolic link refused');
      if(st.isDirectory()){directories.push(relative);if(directories.length>MAX_FILES)throw Error('too many directories'); yield* visit(relative);continue;}
      const data=readRegular(file); size+=data.length; if(size>MAX_SITE||files.length>=MAX_FILES)throw Error('site exceeds 32 MiB or 1000 files');
      const kind=RX.htmlExtension.test(entry)?'html':RX.cssExtension.test(entry)?'css':RX.textExtension.test(entry)?'text':'asset';
      const source=kind==='asset'?data.toString('base64'):new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);
      files.push({id:'f_'+crypto.createHash('sha256').update(relative).digest('hex').slice(0,16),path:relative,kind,encoding:kind==='asset'?'base64':'utf8',source,baseHash:hash(data),nodes:kind==='html'?indexHtml(source):[]});
    }
  }
  yield* visit(); return validateModel({rev:0,root:'site',directories,files});
}
function importSite(root){const steps=importSiteSteps(root);for(;;){const r=steps.next();if(r.done)return r.value;}}
function bytes(file){return Buffer.from(file.source,file.encoding==='base64'?'base64':'utf8');}
function fingerprint(model){return hash(JSON.stringify({directories:allDirectories(model),files:model.files.map(f=>[f.path,hash(bytes(f))]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)}));}
function allDirectories(model){const dirs=new Set(model.directories||[]);for(const f of model.files){const parts=f.path.split('/');parts.pop();while(parts.length){dirs.add(parts.join('/'));parts.pop();}}return [...dirs].sort();}
function within(a,b){a=native.pathKey(a);b=native.pathKey(b);return a===b||a.startsWith(b+path.sep);}
function writeTree(root,model) {
  checkedPath(root,{missing:true});if(fs.existsSync(root))throw Error('working tree destination already exists');native.privateDirectory(root);
  try {
  for(const directory of allDirectories(model)){if(!safePath(directory))throw Error('unsafe directory');native.privateDirectory(path.join(root,directory));}
  for(const file of model.files){if(!safePath(file.path))throw Error('unsafe path');const dest=path.join(root,file.path);native.privateDirectory(path.dirname(dest));checkedPath(dest,{missing:true});const fd=native.privateFile(dest);try{fs.writeFileSync(fd,bytes(file));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  } catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
}
module.exports={MAX_FILE,MAX_SITE,MAX_FILES,allDirectories,checkedPath,readRegular,importSite,importSiteSteps,bytes,fingerprint,within,writeTree};
