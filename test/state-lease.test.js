'use strict';
const {privateMkdir,privateWrite}=require('./helpers');
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawn,spawnSync}=require('node:child_process');const {fixture}=require('./helpers');
const root=path.join(__dirname,'..');
async function heldLease(t,directory,{tz='UTC0',platform=process.platform,startTogether}={}) {
 privateMkdir(directory,{recursive:true,mode:0o700});
 const script=`Object.defineProperty(process,'platform',{value:process.env.TEST_PLATFORM});const fs=require('node:fs');const path=require('node:path');
 function acquire(startAt){const startedAt=Date.now();const release=require('./src/state-lease').acquireLease(process.env.TEST_STATE);process.send({owner:JSON.parse(fs.readFileSync(path.join(process.env.TEST_STATE,'lease.json'))),startAt,startedAt});process.once('message',()=>{release();process.exit(0);});}
 if(process.env.TEST_SHARED_START==='1'){const deadline=setTimeout(()=>{console.error('shared lease start deadline exceeded');process.exit(1);},10000);process.once('message',({startAt})=>{clearTimeout(deadline);const sleeper=new Int32Array(new SharedArrayBuffer(4));while(Date.now()<startAt)Atomics.wait(sleeper,0,0,startAt-Date.now());acquire(startAt);});process.send({waiting:true});}else acquire();`;
 const child=spawn(process.execPath,['-e',script],{cwd:root,env:{...process.env,TZ:tz,TEST_PLATFORM:platform,TEST_STATE:directory,TEST_SHARED_START:startTogether?'1':'0'},stdio:['ignore','pipe','pipe','ipc']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;});
 const result=await Promise.race([new Promise(resolve=>child.on('message',message=>{if(message.waiting)startTogether(child);else resolve(message);})),exited.then(()=>{throw Error('lease holder exited: '+stderr);})]);
 return {child,...result,exited};
}
function contender(directory,{tz='UTC0',platform=process.platform}={}) {
 return spawnSync(process.execPath,['-e',`Object.defineProperty(process,'platform',{value:process.env.TEST_PLATFORM});require('./src/state-lease').acquireLease(process.env.TEST_STATE)();`],{cwd:root,env:{...process.env,TZ:tz,TEST_PLATFORM:platform,TEST_STATE:directory},encoding:'utf8',timeout:process.platform==='win32'?30000:10000});
}
test('POSIX process identity preserves a live owner across different time zones',async t=>{
 if(process.platform==='win32'){t.skip('POSIX ps fixture');return;}
 const o=fixture(t),holder=await heldLease(t,o.dataRoot,{tz:'America/Los_Angeles',platform:'darwin'});
 const file=path.join(o.dataRoot,'lease.json'),before=fs.readFileSync(file);
 const next=contender(o.dataRoot,{tz:'Asia/Tokyo',platform:'darwin'});
 assert.equal(next.error,undefined);assert.equal(next.status,1,next.stderr);assert.match(next.stderr,/owner is alive/);
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(holder.child.exitCode,null);
 holder.child.send('stop');assert.deepEqual(await holder.exited,{code:0,signal:null});
});
test('lease recovery refuses a different PID namespace, host or platform before probing its PID',async t=>{
 if(process.platform!=='linux'){t.skip('Linux PID namespace fixture');return;}
 const o=fixture(t),holder=await heldLease(t,o.dataRoot),file=path.join(o.dataRoot,'lease.json');
 const original=fs.readFileSync(file),value=JSON.parse(original);
 assert.deepEqual(value.scope,{kind:'linux',hostname:require('node:os').hostname(),pidNamespace:fs.readlinkSync('/proc/self/ns/pid')});
 for(const change of [{pidNamespace:'pid:[different]'},{hostname:'another-host'},{kind:'darwin'}]) {
  for(const pid of [holder.child.pid,2147483647]) {
   const before=JSON.stringify({...value,pid,scope:{...value.scope,...change}});privateWrite(file,before);
   const next=contender(o.dataRoot);assert.equal(next.status,1,next.stderr);assert.match(next.stderr,/cannot verify.*owner.*scope/i);assert.equal(fs.readFileSync(file,'utf8'),before);
  }
 }
 privateWrite(file,original);holder.child.send('stop');await holder.exited;
});
test('unscoped leases require manual verification even when the local PID is absent',t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});const file=path.join(o.dataRoot,'lease.json');
 for(const identity of [undefined,{kind:process.platform,startTime:'old',bootId:'old'}]) {
  const before=JSON.stringify({entry:'site-studio',pid:2147483647,nonce:'b'.repeat(32),...(identity?{process:identity}:{})});privateWrite(file,before);
  const next=contender(o.dataRoot);assert.equal(next.status,1,next.stderr);assert.match(next.stderr,/cannot verify.*owner.*scope/i);assert.equal(fs.readFileSync(file,'utf8'),before);
 }
});
function hookedLease(hooks) {
 const module={exports:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'src/state-lease.js'),'utf8'),{module,process,Buffer,require:name=>name==='node:fs'?{...fs,...hooks}:require(name.startsWith('./')?path.join(root,'src',name):name)});return module.exports;
}
test('a failed recoverer preserves an abandoned claim while another recoverer is paused',async t=>{
 const o=fixture(t),paused=await heldLease(t,path.join(o.root,'paused-holder'));privateMkdir(o.dataRoot,{mode:0o700});
 const file=path.join(o.dataRoot,'lease.json'),dead={...paused.owner,pid:2147483647,nonce:'a'.repeat(32)},abandoned={...dead,nonce:'b'.repeat(32)};
 privateWrite(file,JSON.stringify(dead));const before=fs.readFileSync(file),ancestor=path.join(o.dataRoot,'.lease-recovery-'+dead.nonce),nextClaim=path.join(o.dataRoot,'.lease-recovery-'+abandoned.nonce);
 privateWrite(ancestor,JSON.stringify(abandoned));const ancestorBefore=fs.readFileSync(ancestor);let injected=false;
 const lease=hookedLease({linkSync(from,to){
  // Pause a live recoverer immediately after it claims the abandoned chain.
  // The failing contender has already read the ancestor; it owns neither claim.
  if(to===nextClaim&&!injected){injected=true;privateWrite(nextClaim,JSON.stringify(paused.owner));}
  return fs.linkSync(from,to);
 }});
 assert.throws(()=>lease.acquireLease(o.dataRoot),/recovery owner is alive/);assert(injected);
 const third=contender(o.dataRoot);assert.equal(third.status,1,third.stderr);assert.match(third.stderr,/recovery owner is alive/);
 assert.deepEqual(fs.readFileSync(ancestor),ancestorBefore);assert.deepEqual(fs.readFileSync(file),before);assert.equal(paused.child.exitCode,null);
 paused.child.send('stop');await paused.exited;
});
test('lease cleanup preserves live or unverifiable metadata and only sweeps dead owners',async t=>{
 const o=fixture(t),holder=await heldLease(t,path.join(o.root,'temp-holder'));privateMkdir(o.dataRoot,{mode:0o700});
 const live=path.join(o.dataRoot,'.lease-temp-'+holder.owner.nonce),dead=path.join(o.dataRoot,'.lease-temp-'+'c'.repeat(32)),unknown=path.join(o.dataRoot,'.lease-temp-'+'d'.repeat(32));
 privateWrite(live,JSON.stringify(holder.owner));privateWrite(dead,JSON.stringify({...holder.owner,pid:2147483647}));privateWrite(unknown,'partial write');
 const release=require('../src/state-lease').acquireLease(o.dataRoot);t.after(release);
 assert(fs.existsSync(live),'live contender temp was removed');assert(fs.existsSync(unknown),'unverifiable temp was removed');assert(!fs.existsSync(dead));
 release();holder.child.send('stop');await holder.exited;
});
for(const phase of ['inspect','unlink'])test('lease sweep tolerates metadata disappearing during '+phase,t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});const {processIdentity}=require('../src/state-lease');
 const dead=path.join(o.dataRoot,'.lease-temp-'+'e'.repeat(32));
 const release0=require('../src/state-lease').acquireLease(o.dataRoot),owner=JSON.parse(fs.readFileSync(path.join(o.dataRoot,'lease.json')));release0();
 privateWrite(dead,JSON.stringify({...owner,pid:2147483647,process:processIdentity(process.pid)}));let injected=false;
 const method=phase==='inspect'?'lstatSync':'unlinkSync';
 const lease=hookedLease({[method](file,...args){if(file===dead&&!injected){injected=true;fs.unlinkSync(dead);}return fs[method](file,...args);}});
 const release=lease.acquireLease(o.dataRoot);t.after(release);assert(injected);assert(fs.existsSync(path.join(o.dataRoot,'lease.json')));release();
});
test('a vanished publication temp gives a normal retry message',t=>{
 const o=fixture(t);privateMkdir(o.dataRoot,{mode:0o700});let injected=false;
 const lease=hookedLease({linkSync(from,to){if(!injected){injected=true;fs.unlinkSync(from);}return fs.linkSync(from,to);}});
 assert.throws(()=>lease.acquireLease(o.dataRoot),/State lease startup interrupted.*retry/i);assert(injected);assert(!fs.existsSync(path.join(o.dataRoot,'lease.json')));
});
test('two simultaneous starters leave exactly one owner',async t=>{
 for(let round=0;round<12;round++){
  const o=fixture(t),ready=[];let sharedStart;
  const startTogether=child=>{ready.push(child);if(ready.length===2){sharedStart=Date.now()+100;for(const contender of ready)contender.send({startAt:sharedStart});}};
  const outcomes=await Promise.allSettled([heldLease(t,o.dataRoot,{startTogether}),heldLease(t,o.dataRoot,{startTogether})]);
  assert.equal(ready.length,2,'both contenders must reach the shared start barrier');
  const winners=outcomes.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(winners.length,1,JSON.stringify(outcomes.map(r=>r.reason?.message||r.value.owner.pid)));
  const winner=winners[0];assert.equal(winner.startAt,sharedStart);assert(winner.startedAt>=sharedStart);assert.equal(JSON.parse(fs.readFileSync(path.join(o.dataRoot,'lease.json'))).pid,winner.child.pid);
  winner.child.send('stop');assert.deepEqual(await winner.exited,{code:0,signal:null});
 }
});
test('first import ignores only exact internal lease metadata names',async t=>{
 const o=fixture(t),holder=await heldLease(t,path.join(o.root,'import-holder'));privateMkdir(o.dataRoot,{mode:0o700});
 for(const prefix of ['temp','recovery'])privateWrite(path.join(o.dataRoot,'.lease-'+prefix+'-'+holder.owner.nonce),JSON.stringify(holder.owner));
 const app=require('../web-server').createCoordinator(o);t.after(()=>app.close());assert.equal(app.model.rev,0);await app.close();
 for(const name of ['.lease-temp-note','.lease-recovery-'+'z'.repeat(32),'.lease-temp-'+'a'.repeat(32)+'.txt']){
  const next=fixture(t);privateMkdir(next.dataRoot,{mode:0o700});privateWrite(path.join(next.dataRoot,name),'user content');
  assert.throws(()=>require('../web-server').createCoordinator(next),/empty dedicated directory/);assert.equal(fs.readFileSync(path.join(next.dataRoot,name),'utf8'),'user content');
 }
 holder.child.send('stop');await holder.exited;
});
test('refusals identify the lease and PID and explain manual verification for old records',async t=>{
 const o=fixture(t),holder=await heldLease(t,o.dataRoot),file=path.join(o.dataRoot,'lease.json');
 let next=contender(o.dataRoot);assert(next.stderr.includes(file));assert(next.stderr.includes('PID '+holder.child.pid));
 const before=JSON.stringify({entry:'site-studio',pid:holder.child.pid,nonce:holder.owner.nonce});privateWrite(file,before);
 next=contender(o.dataRoot);assert.equal(next.status,1);assert(next.stderr.includes(file));assert(next.stderr.includes('PID '+holder.child.pid));assert.match(next.stderr,/manually verify.*before removing/i);assert.doesNotMatch(next.stderr,/owner is alive/);assert.equal(fs.readFileSync(file,'utf8'),before);
 holder.child.send('stop');await holder.exited;
});
function windowsIdentity(env,execFileSync) {
 const module={exports:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'src/state-lease.js'),'utf8'),{module,process:{platform:'win32',env},Buffer,require:name=>name==='node:child_process'?{execFileSync}:require(name.startsWith('./')?path.join(root,'src',name):name)});return module.exports.processIdentity;
}
test('Windows identity launches only PowerShell beneath the absolute SystemRoot',()=>{
 const calls=[],systemRoot='C:\\System Root';
 const identity=windowsIdentity({SystemRoot:systemRoot,PATH:'C:\\untrusted-cwd'},(command,args,options)=>{calls.push({command,args,options});return '123456789\n';})(123);
 assert.equal(identity.kind,'win32');assert.equal(identity.startTime,'123456789');assert.equal(calls.length,1);
 assert.equal(calls[0].command,'C:\\System Root\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(calls[0].options.timeout,5000);assert(calls[0].args.includes('-NoProfile'));
});
test('Windows identity refuses missing or relative SystemRoot without searching cwd or PATH',()=>{
 for(const SystemRoot of [undefined,'','Windows','\\Windows','C:Windows']){
  let called=false;const identity=windowsIdentity({SystemRoot},()=>{called=true;return '123';});
  assert.throws(()=>identity(123),/SystemRoot/);assert.equal(called,false);
 }
});
test('a vanished recovery claim retries the current primary lease without displacing a new owner',async t=>{
 for(const replacement of ['stale','live']){
  const o=fixture(t),holder=await heldLease(t,path.join(o.root,'claim-holder'));privateMkdir(o.dataRoot,{mode:0o700});
  const file=path.join(o.dataRoot,'lease.json'),dead={...holder.owner,pid:2147483647,nonce:'a'.repeat(32)},claim=path.join(o.dataRoot,'.lease-recovery-'+dead.nonce);
  privateWrite(file,JSON.stringify(dead));privateWrite(claim,JSON.stringify({...dead,nonce:'b'.repeat(32)}));let injected=false;
  const lease=hookedLease({lstatSync(target,...args){
   if(target===claim&&!injected){injected=true;fs.unlinkSync(claim);if(replacement==='live'){fs.unlinkSync(file);privateWrite(file,JSON.stringify(holder.owner));}}
   return fs.lstatSync(target,...args);
  }});
  if(replacement==='stale'){
   const release=lease.acquireLease(o.dataRoot);t.after(release);assert.equal(JSON.parse(fs.readFileSync(file)).pid,process.pid);release();assert(!fs.existsSync(file));
  }else{
   assert.throws(()=>lease.acquireLease(o.dataRoot),/owner is alive/);assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(holder.owner));
  }
  assert(injected);holder.child.send('stop');await holder.exited;
 }
});
