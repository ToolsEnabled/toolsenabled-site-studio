'use strict';
// Windows custody uses the current SID and NTFS DACLs, never chmod as a proxy.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
let identity;
function windowsLocalPath(value,paths=path.win32) {
  if(typeof value!=='string'||!paths.isAbsolute(value)||value.length>240||value.includes('\0')
    ||value.startsWith('\\\\')||paths.parse(value).root.length!==3)throw Error('Windows paths require an ordinary local drive path of at most 240 characters');
  for(const part of value.replaceAll('/','\\').slice(3).split('\\')) {
    if(!part||part==='.'||part==='..')continue;
    const stem=part.split('.')[0].toUpperCase();
    if(part.includes(':')||part.endsWith(' ')||part.endsWith('.')||['CON','PRN','AUX','NUL','CONIN$','CONOUT$'].includes(stem)
      ||(['COM','LPT'].some(prefix=>stem.startsWith(prefix)&&['1','2','3','4','5','6','7','8','9','¹','²','³'].includes(stem.slice(prefix.length)))))throw Error('Windows paths refuse alternate streams, device names and trailing dots or spaces');
  }
  return value;
}
function bridge(operation,target) {
  if(process.env.SITE_STUDIO_WINDOWS_CANDIDATE!=='1')throw Error('Native Windows is an unqualified candidate; explicitly set SITE_STUDIO_WINDOWS_CANDIDATE=1 for isolated qualification.');
  if(target!==undefined)windowsLocalPath(target);
  const systemRoot=process.env.SystemRoot;
  if(typeof systemRoot!=='string')throw Error('Windows custody requires SystemRoot');
  windowsLocalPath(systemRoot);
  const env={SystemRoot:systemRoot,windir:systemRoot};
  for(const name of ['TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
  try {
    const text=execFileSync(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),
      ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-private.ps1')],
      {input:JSON.stringify({operation,path:target}),env,encoding:'utf8',timeout:15000,maxBuffer:256*1024,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const result=JSON.parse(text.charCodeAt(0)===0xFEFF?text.slice(1):text);
    if(result?.schema!=='site-studio/windows-custody/1'||result.ok!==true||typeof result.sid!=='string')throw Error('invalid native custody receipt');
    return result;
  } catch(error) {
    // Do not reflect parser output, environment values or arbitrary ACL text.
    throw Error('Windows private-folder check failed; use an owned local NTFS folder with private permissions ('+(error.code||'native refusal')+').');
  }
}
function windowsIdentity(){if(!identity)identity=bridge('identity');return identity;}
function defaultDataRoot(sourceKey) {
  return process.platform==='win32'?path.join(windowsIdentity().localAppData,'ToolsEnabled','SiteStudio',sourceKey)
    :path.join(os.homedir(),'.site-studio',sourceKey);
}
function privateDirectory(target,{existing=false,tree=false}={}) {
  if(process.platform==='win32'){bridge(existing?(tree?'inspect-tree':'inspect'):'directory',target);return;}
  if(!existing)fs.mkdirSync(target,{recursive:true,mode:0o700});
  if(fs.statSync(target).mode&0o077)throw Error('state root must have private permissions (chmod 700)');
}
function privateFile(target) {
  if(process.platform!=='win32')return fs.openSync(target,'wx',0o600);
  if(fs.existsSync(target)){const error=Error('private file already exists');error.code='EEXIST';throw error;}
  bridge('file',target);
  return fs.openSync(target,'r+');
}
function inspectWindowsPath(target,{tree=false}={}) {
  if(process.platform==='win32')bridge(tree?'path-tree':'path',target);
}
function pathKey(value){return process.platform==='win32'?path.normalize(value).toLowerCase():value;}
module.exports={windowsLocalPath,windowsIdentity,defaultDataRoot,privateDirectory,privateFile,inspectWindowsPath,pathKey};
