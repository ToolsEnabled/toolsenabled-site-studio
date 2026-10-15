'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const native=require('../src/native-filesystem');
test('Windows path admission refuses alternate namespaces, streams and Win32 aliases before filesystem access',()=>{
  for(const value of ['C:relative','\\rooted','\\\\server\\share\\site','\\\\?\\C:\\site','C:\\site\\file:secret','C:\\site.\\state','C:\\site \\state','C:\\NUL.txt','C:\\COM1','C:\\LPT².txt','C:\\'+ 'a'.repeat(240)])assert.throws(()=>native.windowsLocalPath(value),/Windows paths/);
  for(const value of ['C:\\Users\\Sample Person\\site','D:/projects/λ-site','C:\\COM10','C:\\site\\..\\other'])assert.equal(native.windowsLocalPath(value),value);
});
test('Windows pane request uses PowerShell before Node and preserves quoted Unicode arguments',async()=>{
  const {readerLaunch}=await import('../hooks/view-contract.mjs');
  assert.throws(()=>readerLaunch({root:'C:/Tools/Site Studio',view:'home',env:{SystemRoot:'C:/Windows'}}),/unqualified candidate/);
  const root='C:\\Tools\\Site Studio',args=['R&D “λ”','trailing\\'];
  const launch=readerLaunch({root,view:'find',args,options:{site_directory:'C:\\work\\site',data_directory:'C:\\work\\state'},env:{SITE_STUDIO_WINDOWS_CANDIDATE:'1',PATH:'C:\\Program Files\\nodejs',SystemRoot:'C:\\Windows',TEMP:'C:\\tmp',NODE_OPTIONS:'--require poison'}});
  assert.match(launch.argv[0],/powershell.exe$/);assert.equal(launch.init.timeoutMs,5000);
  const receipt=JSON.parse(Buffer.from(launch.argv.at(-1),'base64').toString('utf16le'));
  assert.equal(receipt.args[1],root+'/tools/site-studio-view.js');assert.deepEqual(receipt.args.slice(3,5),args);
  assert.equal(Object.hasOwn(receipt.env,'NODE_OPTIONS'),false);assert.deepEqual(Object.keys(receipt.env).sort(),['PATH','SystemRoot','TEMP','TMP']);
});
test('native Windows candidate requires explicit opt in before private directory operations',{skip:process.platform!=='win32'},()=>{
  const before=process.env.SITE_STUDIO_WINDOWS_CANDIDATE;delete process.env.SITE_STUDIO_WINDOWS_CANDIDATE;
  try{assert.throws(()=>native.privateDirectory(path.join(require('node:os').tmpdir(),'must-not-be-created')),/unqualified candidate/);}
  finally{if(before===undefined)delete process.env.SITE_STUDIO_WINDOWS_CANDIDATE;else process.env.SITE_STUDIO_WINDOWS_CANDIDATE=before;}
});
test('Windows PowerShell 5.1 raw ACL assessor accepts safe grants and refuses replacement rights',{skip:process.platform!=='win32'},t=>{
  process.env.SITE_STUDIO_WINDOWS_CANDIDATE='1';
  const root=path.join(require('node:os').tmpdir(),'site-studio-acl-'+require('node:crypto').randomBytes(8).toString('hex'));
  native.privateDirectory(root);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const r=require('node:child_process').spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-acl-flags.test.ps1'),'-ProbeDirectory',root],{encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(r.status,0,r.stderr);const receipt=JSON.parse(r.stdout);assert.equal(receipt.passed,8);assert.equal(receipt.failed,0);assert.equal(receipt.powershellMajor,5);
});
test('native private state has current-SID custody, survives case-alias restart and refuses a hard-linked source',{skip:process.platform!=='win32'},async t=>{
  process.env.SITE_STUDIO_WINDOWS_CANDIDATE='1';
  const root=path.join(require('node:os').tmpdir(),'site-studio-native-'+require('node:crypto').randomBytes(8).toString('hex'));
  native.privateDirectory(root);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceRoot=path.join(root,'source'),dataRoot=path.join(root,'state');fs.mkdirSync(path.join(sourceRoot,'nested'),{recursive:true});fs.writeFileSync(path.join(sourceRoot,'index.html'),'<h1>Native</h1>');fs.writeFileSync(path.join(sourceRoot,'nested','other.html'),'<p>Nested</p>');
  const {createStore}=require('../src/studio-store'),first=createStore({sourceRoot,dataRoot});t.after(()=>first.close());
  const result=require('node:child_process').spawnSync(path.win32.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-state-custody.ps1'),'-DataDirectory',dataRoot],{encoding:'utf8',timeout:20000,windowsHide:true,env:require('./helpers').childEnv()});
  assert.equal(result.status,0,result.stderr);const custody=JSON.parse(result.stdout);assert(custody.count>=6);assert(custody.records.some(r=>r.relativePath==='\\lease.json'));assert(custody.records.some(r=>r.relativePath==='\\state.json'));assert(custody.records.some(r=>r.relativePath.endsWith('\\nested\\other.html')));
  await require('./helpers').saveEvidence(e=>e.write('windows/current-sid-state-custody.json',JSON.stringify(custody,null,2)+'\n'));
  first.close();
  const second=createStore({sourceRoot:sourceRoot.toUpperCase(),dataRoot:dataRoot.toUpperCase()});second.close();
  fs.linkSync(path.join(sourceRoot,'index.html'),path.join(root,'alias.html'));
  assert.throws(()=>createStore({sourceRoot,dataRoot}),/hard link/);
});
test('native asynchronous startup abort releases the acquired lease',{skip:process.platform!=='win32'},async t=>{
  const o=require('./helpers').fixture(t),controller=new AbortController();
  const dense='<p>'.repeat(150000)+'</x>'.repeat(150000);fs.writeFileSync(path.join(o.sourceRoot,'dense.html'),dense);
  let sawLease=false;const timer=setInterval(()=>{if(fs.existsSync(path.join(o.dataRoot,'lease.json'))){sawLease=true;controller.abort();}},1);t.after(()=>clearInterval(timer));
  await assert.rejects(require('../src/studio-store').createStoreAsync(o,controller.signal),e=>e.name==='AbortError');
  clearInterval(timer);assert(sawLease);assert(!fs.existsSync(path.join(o.dataRoot,'lease.json')));
});
