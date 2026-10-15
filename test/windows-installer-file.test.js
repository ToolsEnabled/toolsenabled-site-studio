'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
test('documented installer runs from fresh Windows PowerShell -File with native-pipe BOM and Unicode paths',{skip:process.platform!=='win32',timeout:300000},async t=>{
 const native=require('../src/native-filesystem'),helpers=require('./helpers');
 const previous=process.env.SITE_STUDIO_WINDOWS_CANDIDATE;process.env.SITE_STUDIO_WINDOWS_CANDIDATE='1';
 t.after(()=>{if(previous===undefined)delete process.env.SITE_STUDIO_WINDOWS_CANDIDATE;else process.env.SITE_STUDIO_WINDOWS_CANDIDATE=previous;});
 const root=path.join(os.tmpdir(),'ss-bom-'+crypto.randomBytes(4).toString('hex'));native.privateDirectory(root);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source space'),site=path.join(root,"site's résumé 中文 😀"),program=path.join(root,'program'),state=path.join(root,'state');
 fs.mkdirSync(source);fs.mkdirSync(site);fs.writeFileSync(path.join(site,'index.html'),'<h1>Own installer fixture</h1>');
 const product=path.resolve(__dirname,'..'),members=JSON.parse(fs.readFileSync(path.join(product,'tools/package-files.json'),'utf8'));
 assert.deepEqual(members,[...new Set(members)].sort());const hashes=new Map();
 for(const member of members){
  assert(!path.isAbsolute(member)&&!member.includes('\\')&&!member.includes(':')&&!member.split('/').some(x=>!x||x==='.'||x==='..'));
  const input=path.join(product,member);assert(fs.lstatSync(input).isFile());const raw=fs.readFileSync(input),output=path.join(source,member);
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,raw,{flag:'wx'});hashes.set(member,crypto.createHash('sha256').update(raw).digest('hex'));
 }
 fs.writeFileSync(path.join(source,'MANIFEST.sha256'),[...hashes].map(([name,hash])=>hash+'  '+name+'\n').join(''),{flag:'wx'});
 const env={...helpers.childEnv(),SystemRoot:'C:\\Windows',PATH:path.dirname(process.execPath)+';C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0',PATHEXT:'.COM;.EXE;.BAT;.CMD'};
 const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(source,'install.ps1'),'-Site',site,'-DataDirectory',state,'-Prefix',program,'-EnableWindowsCandidate'];
 // A fresh -File PowerShell process is intentional. Do not dot-source/invoke the
 // installer in an existing PS process, or override its native-pipe encoding.
 const first=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',args,{env,cwd:source,timeout:180000,windowsHide:true,maxBuffer:2*1024*1024});
 await helpers.saveEvidence(e=>e.write('windows/fresh-file-installer.json',JSON.stringify({status:first.status,signal:first.signal,error:first.error?.message,stdoutBase64:first.stdout?.toString('base64'),stderrBase64:first.stderr?.toString('base64')},null,2)+'\n'));
 assert.ifError(first.error);assert.equal(first.signal,null);assert.equal(first.status,0,first.stderr.toString('utf8'));
 for(const [member,expected] of hashes)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(program,member))).digest('hex'),expected,member);
 assert.deepEqual(fs.readFileSync(path.join(program,'MANIFEST.sha256')),fs.readFileSync(path.join(source,'MANIFEST.sha256')));
 assert.deepEqual(fs.readFileSync(path.join(site,'index.html')),Buffer.from('<h1>Own installer fixture</h1>'));
 const second=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',args,{env,cwd:source,timeout:60000,windowsHide:true,maxBuffer:2*1024*1024});
 assert.ifError(second.error);assert.notEqual(second.status,0);assert.match(second.stderr.toString('utf8'),/Choose new install and state folders/);
 for(const [member,expected] of hashes)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(program,member))).digest('hex'),expected,'refusal changed '+member);
 await helpers.saveEvidence(e=>e.write('windows/fresh-file-installed-manifest.json',JSON.stringify({publicInstallerFreshFile:true,unicodeSite:site,filesVerified:hashes.size,existingDestinationRefused:true,sourceUnchanged:true},null,2)+'\n'));
});
