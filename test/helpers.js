'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
module.exports={fixture,textOp};
