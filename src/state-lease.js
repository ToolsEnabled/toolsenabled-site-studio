'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {execFileSync}=require('node:child_process');

// A PID can be reused. Always compare its OS process creation identity as well.
function processIdentity(pid) {
  if(!Number.isSafeInteger(pid)||pid<1)throw Error('invalid state lease PID');
  try {
    if(process.platform==='linux') {
      const bootId=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
      const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');
      const fields=stat.slice(stat.lastIndexOf(') ')+2).split(' ');
      if(fields[0]==='Z'||fields[0]==='X')return null;
      if(!fields[19])throw Error('process start time unavailable');
      return {kind:'linux',bootId,startTime:fields[19]};
    }
    if(process.platform==='win32') {
      const systemRoot=process.env.SystemRoot;
      if(typeof systemRoot!=='string'||!path.win32.isAbsolute(systemRoot)||path.win32.parse(systemRoot).root.length===1)throw Error('SystemRoot must be a fully qualified Windows directory');
      const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
      const script='$ErrorActionPreference="Stop"; $p=Get-Process -Id '+pid+' -ErrorAction SilentlyContinue; if ($null -eq $p) { "gone" } else { $p.StartTime.ToUniversalTime().Ticks.ToString() }';
      const value=execFileSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:5000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
      if(value==='gone')return null;
      if(!value||Array.from(value).some(c=>!('0123456789'.includes(c))))throw Error('process start time unavailable');
      return {kind:'win32',startTime:value};
    }
    const value=execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:5000,env:{...process.env,LC_ALL:'C',TZ:'UTC0'},stdio:['ignore','pipe','pipe']}).trim();
    return value?{kind:process.platform,startTime:value}:null;
  } catch(e) {
    if(process.platform==='linux'&&e.code==='ENOENT'&&e.path==='/proc/'+pid+'/stat')return null;
    if(process.platform!=='linux'&&process.platform!=='win32'&&e.status===1&&!String(e.stdout||'').trim())return null;
    throw Error('Cannot verify state lease process identity: '+(e.code||e.message));
  }
}
const nonceValid=n=>typeof n==='string'&&n.length===32&&Array.from(n).every(c=>'0123456789abcdef'.includes(c));
function readLease(file) {
  if(!fs.lstatSync(file).isFile())throw Error('invalid state lease file');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
  try {
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size>4096)throw Error('invalid state lease file');
    const value=JSON.parse(fs.readFileSync(fd,'utf8'));
    if(value.entry!=='site-studio'||!Number.isSafeInteger(value.pid)||value.pid<1||!nonceValid(value.nonce))throw Error('invalid state lease owner');
    if('process' in value&&(!value.process||typeof value.process.kind!=='string'||!value.process.kind||typeof value.process.startTime!=='string'||!value.process.startTime||value.process.kind==='linux'&&(typeof value.process.bootId!=='string'||!value.process.bootId)))throw Error('invalid state lease identity');
    return {value,stat};
  } catch(e) {throw Error('Cannot read state lease safely: '+e.message);}
  finally {fs.closeSync(fd);}
}
function unlinkGone(file) {try{fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
function sameFile(file,stat) {try{const now=fs.lstatSync(file);return now.isFile()&&!now.isSymbolicLink()&&now.dev===stat.dev&&now.ino===stat.ino;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function identityScope() {
  try {
    const scope={kind:process.platform,hostname:os.hostname(),pidNamespace:process.platform==='linux'?fs.readlinkSync('/proc/self/ns/pid'):null};
    if(!scope.hostname||process.platform==='linux'&&!scope.pidNamespace)throw Error('scope unavailable');
    return scope;
  } catch(e) {throw Error('Cannot verify state lease owner scope: '+(e.code||e.message));}
}
function ownerAlive(owner,scope,file) {
  // A PID (even with the same boot ID) has meaning only in its original scope.
  // Missing scope in an older lease is not proof that its owner is gone.
  if(!owner.scope||owner.scope.kind!==scope.kind||owner.scope.hostname!==scope.hostname||owner.scope.pidNamespace!==scope.pidNamespace||owner.process&&owner.process.kind!==scope.kind)throw Error('Cannot verify state lease owner scope. Lease '+file+' (PID '+owner.pid+'). Manually verify all writers on the original host and PID namespace have stopped before removing this lease.');
  if(!owner.process)throw Error('Cannot verify state lease owner creation identity. Lease '+file+' (PID '+owner.pid+'). Manually verify all writers have stopped before removing this lease.');
  let current;
  try{current=processIdentity(owner.pid);}catch(e){throw Error(e.message+'; lease '+file+' (PID '+owner.pid+').');}
  if(!current)return false;
  return current.kind===owner.process.kind&&current.startTime===owner.process.startTime&&current.bootId===owner.process.bootId;
}
function acquireLease(directory) {
  const file=path.join(directory,'lease.json');
  const owner={pid:process.pid,entry:'site-studio',nonce:crypto.randomBytes(16).toString('hex'),process:processIdentity(process.pid),scope:identityScope()};
  if(!owner.process)throw Error('Cannot determine this process state lease identity');
  const temporary=path.join(directory,'.lease-temp-'+owner.nonce);
  const fd=fs.openSync(temporary,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(owner));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const claims=[];let leaseStat,recovered=false;
  const publish=target=>{try{fs.linkSync(temporary,target);return true;}catch(e){if(e.code==='EEXIST')return false;if(e.code==='ENOENT')throw Error('State lease startup interrupted; retry startup.');throw e;}};
  try {
    startup: for(let attempt=0;attempt<16;attempt++) {
      if(publish(file)){leaseStat=fs.lstatSync(file);break;}
      let existing;try{existing=readLease(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if(ownerAlive(existing.value,owner.scope,file))throw Error('State lease owner is alive: '+file+' (PID '+existing.value.pid+'). Stop the other Site Studio process or choose another --data-dir.');
      // Immutable, nonce-named recovery claims serialize removal. If a recovery
      // process itself died, follow its identity to a new claim; never replace
      // a claim another contender may already be checking.
      let previous=existing.value,claimed=false;
      for(let depth=0;depth<32;depth++) {
        const claim=path.join(directory,'.lease-recovery-'+previous.nonce);
        if(publish(claim)){claims.push({file:claim,stat:fs.lstatSync(claim)});claimed=true;break;}
        let holder;try{holder=readLease(claim);}catch(e){if(e.code==='ENOENT')continue startup;throw e;}
        if(ownerAlive(holder.value,owner.scope,claim))throw Error('State lease recovery owner is alive: '+claim+' (PID '+holder.value.pid+'). Retry after its startup finishes.');
        previous=holder.value;
      }
      if(!claimed)throw Error('State lease recovery chain is too long; inspect the state directory.');
      if(sameFile(file,existing.stat)&&readLease(file).value.nonce===existing.value.nonce){fs.unlinkSync(file);recovered=true;}
    }
    if(!leaseStat)throw Error('State lease changed repeatedly; retry startup.');
    // Claims left by a crash are internal metadata, never working-copy files.
    // The fresh primary lease prevents another owner from starting recovery.
    for(const name of fs.readdirSync(directory))for(const prefix of ['.lease-temp-','.lease-recovery-'])if(name.startsWith(prefix)&&nonceValid(name.slice(prefix.length))){
      const candidate=path.join(directory,name);if(candidate===temporary)continue;
      // Another starter may still be writing or linking its temp. Unknown or
      // live ownership is never enough evidence to delete that metadata.
      let holder;
      try {holder=readLease(candidate);if(ownerAlive(holder.value,owner.scope,candidate))continue;}
      catch {continue;}
      if(sameFile(candidate,holder.stat))unlinkGone(candidate);
    }
    if(recovered)process.stderr.write('Recovered stale Site Studio state lease; the previous owner process is gone.\n');
    let closed=false;
    return ()=>{if(closed)return;closed=true;if(sameFile(file,leaseStat))unlinkGone(file);};
  } catch(e) {
    if(leaseStat&&sameFile(file,leaseStat))unlinkGone(file);
    throw e;
  } finally {
    for(const claim of claims)if(sameFile(claim.file,claim.stat))unlinkGone(claim.file);
    try{fs.unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
}
module.exports={acquireLease,processIdentity};
