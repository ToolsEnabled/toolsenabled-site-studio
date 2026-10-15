'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// Windows elevated tokens default to Administrators as the owner. State fixtures
// must ask for the current SID explicitly, just as the product does.
function privateMkdir(target,options={}) {
  if(process.platform==='win32')require('../src/native-filesystem').privateDirectory(target);
  else fs.mkdirSync(target,options);
}
function privateWrite(target,data,options) {
  if(process.platform==='win32'&&!fs.existsSync(target)) {
    const fd=require('../src/native-filesystem').privateFile(target);
    try{fs.writeFileSync(fd,data,options);}finally{fs.closeSync(fd);}
  } else fs.writeFileSync(target,data,options);
}
function publicReadFixture(target) {
  if(process.platform!=='win32'){fs.chmodSync(target,0o755);return;}
  const script='[Console]::InputEncoding=New-Object Text.UTF8Encoding($false);$ErrorActionPreference="Stop";$p=[Console]::In.ReadToEnd();$acl=Get-Acl -LiteralPath $p;$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier("S-1-5-32-545")),[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow);[void]$acl.AddAccessRule($rule);Set-Acl -LiteralPath $p -AclObject $acl';
  require('node:child_process').execFileSync(path.win32.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input:target,encoding:'utf8',env:childEnv(),timeout:15000,windowsHide:true});
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-studio-test-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const sourceRoot = path.join(root, 'original'); fs.mkdirSync(path.join(sourceRoot, 'nested'), {recursive:true});
  fs.writeFileSync(path.join(sourceRoot,'index.html'), '<!doctype html><html><head><title>Home</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Home</h1><p>Welcome</p><img src="nested/pixel.png" alt="Pixel"></main></body></html>');
  fs.writeFileSync(path.join(sourceRoot,'nested/about.html'), '<!doctype html><html><head><title>About</title></head><body><main><h1>About</h1></main></body></html>');
  fs.writeFileSync(path.join(sourceRoot,'styles.css'), 'h1 { color: navy; }');
  fs.writeFileSync(path.join(sourceRoot,'nested/pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=','base64'));
  return Object.defineProperty({sourceRoot, dataRoot:path.join(root,'state'), exportRoot:path.join(root,'export')}, 'root', {value:root});
}
function textOp(model, text='Changed') {
  const {hash}=require('../src/web-model'); const f=model.files.find(f=>f.path==='index.html'); const n=f.nodes.find(n=>n.selectorHint==='h1');
  return {type:'set_text',expectedRev:model.rev,fileId:f.id,nodeId:n.id,baseHash:hash(f.source.slice(...n.range)),text};
}
// A child process that a test starts gets only these variables: PATH to find programs, the
// temporary-folder variables (TMPDIR; TEMP and TMP on Windows), on Windows SystemRoot, which the
// server's process check needs, and any variable the caller names (the browser needs HOME).
// Nothing else from the runner's environment.
const CHILD_ENV = ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', ...(process.platform==='win32'?['SITE_STUDIO_WINDOWS_CANDIDATE']:[])];
function childEnv(...more) {
  const env = {};
  for (const name of [...CHILD_ENV, ...more]) if (process.env[name] !== undefined) env[name] = process.env[name];
  return env;
}
// Evidence files (docs/TESTING.md) are saved only when SITE_STUDIO_EVIDENCE_DIR names a folder. The callback gets
// write(relative path, data) and copy(relative path, source folder); tests never see the folder's path.
async function saveEvidence(save) {
  const root = process.env.SITE_STUDIO_EVIDENCE_DIR;
  if (!root) return;
  const target = rel => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), {recursive:true}); return file; };
  await save({write:(rel, data) => fs.writeFileSync(target(rel), data), copy:(rel, from) => fs.cpSync(from, target(rel), {recursive:true})});
}
// Temporary-folder checks. tools/run-tests.js runs tmpdirProblem() before any test, and the browser helper runs
// tmpdirLengthProblem() before it starts Chrome, so a TMPDIR that cannot work stops with one clear message instead of
// many failures that do not name the cause (docs/TESTING.md).
// The working-copy store refuses any path that reaches its files through a symbolic link, by design, and the tests
// keep their sites under TMPDIR: TMPDIR must be the absolute real path of an existing folder.
// Chrome puts its lock socket at <TMPDIR>/<name>.XXXXXX/SingletonSocket, and a Unix socket path holds at most 107
// bytes. Google Chrome's folder name (com.google.Chrome.XXXXXX) allows a TMPDIR of up to 66 bytes; Chromium's
// (org.chromium.Chromium.XXXXXX) up to 62. Longer, Chrome exits at once and the browser tests fail with a bare
// "read ECONNRESET".
const TMPDIR_MAX_BYTES = 62;
function tmpdirLengthProblem(dir = os.tmpdir()) {
  if(process.platform==='win32')return ''; // No AF_UNIX Chrome lock socket on native Windows.
  const bytes = Buffer.byteLength(dir);
  if (bytes <= TMPDIR_MAX_BYTES) return '';
  return `TMPDIR is ${bytes} bytes long (${dir}); the browser tests need at most ${TMPDIR_MAX_BYTES}. Chrome puts its lock socket in a folder under TMPDIR, and with a longer TMPDIR that socket path exceeds the Unix limit, so Chrome exits and the browser tests fail with "read ECONNRESET". Use a short folder, for example TMPDIR=/tmp/ss.`;
}
function tmpdirProblem(dir = os.tmpdir()) {
  if (!path.isAbsolute(dir)) return `TMPDIR must be an absolute path; "${dir}" is relative. Set TMPDIR to the absolute real path of an existing folder, for example TMPDIR=/tmp/ss.`;
  let real;
  try { real = fs.realpathSync.native(dir); } catch (e) { return `TMPDIR (${dir}) cannot be used: ${e.code || e.message}. Set TMPDIR to an existing folder.`; }
  if (process.platform==='win32') {
    try { require('../src/native-filesystem').windowsLocalPath(dir);require('../src/native-filesystem').inspectWindowsPath(dir); } catch(e) { return 'Windows TEMP custody check failed: '+e.message; }
    return '';
  }
  if (real !== dir) return `TMPDIR must be its folder's real path: ${dir} resolves to ${real} (through a symbolic link, or . or .. parts). The working-copy store refuses paths that go through a symbolic link, by design. Use TMPDIR=${real}.`;
  return tmpdirLengthProblem(dir);
}
module.exports={fixture,textOp,childEnv,privateMkdir,privateWrite,publicReadFixture,saveEvidence,tmpdirProblem,tmpdirLengthProblem};
