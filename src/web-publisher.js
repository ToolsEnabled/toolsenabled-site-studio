'use strict';
// Local human-confirmed export. No deployment or network adapter exists here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {hash} = require('./web-model');
const {checkedPath,within,writeTree,importSite,fingerprint} = require('./web-import');

function exportSite({sourceRoot,dataRoot,exportRoot,originalFingerprint,model,onExport}) {
  if (!exportRoot) throw Error('No export destination configured. Restart with --export-dir.');
  checkedPath(sourceRoot);
  checkedPath(dataRoot);
  checkedPath(exportRoot,{missing:true});
  if (within(exportRoot,dataRoot) || within(dataRoot,exportRoot) ||
      exportRoot !== sourceRoot && (within(exportRoot,sourceRoot) || within(sourceRoot,exportRoot))) {
    throw Error('overlapping export root refused');
  }
  const parent = path.dirname(exportRoot);
  checkedPath(parent);
  if (!fs.statSync(parent).isDirectory()) throw Error('export parent must exist');

  // Independent state directories can refer to the same original. Serialize
  // export across them, then compare source bytes under that exclusive lease.
  const lock = path.join(parent,'.site-studio-export-' + hash(exportRoot).slice(7,31) + '.lock');
  let fd;
  try { fd = fs.openSync(lock,'wx',0o600); }
  catch (e) {
    if (e.code === 'EEXIST') throw Error('export lease exists; stop the other exporter or verify its PID is gone before removing ' + path.basename(lock));
    throw e;
  }
  const suffix = crypto.randomBytes(12).toString('hex');
  const stage = path.join(parent,'.site-studio-stage-' + suffix);
  let backup = null, promoted = false;
  try {
    fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));
    fs.fsyncSync(fd);
    const assertOriginal = () => {
      if (fingerprint(importSite(sourceRoot)) !== originalFingerprint) throw Error('original site drift: export refused');
    };
    assertOriginal();
    const exists = fs.existsSync(exportRoot);
    if (exists && exportRoot !== sourceRoot) throw Error('export destination already exists; choose a new folder');
    if (exists) backup = path.join(parent,'.site-studio-backup-' + suffix);
    writeTree(stage,model);
    assertOriginal();
    checkedPath(exportRoot,{missing:true});
    if (backup) fs.renameSync(exportRoot,backup);
    else if (fs.existsSync(exportRoot)) throw Error('export destination appeared');
    try {
      fs.renameSync(stage,exportRoot);
      promoted = true;
      const receipt = {
        exported:true, files:model.files.length,
        backup:backup ? path.basename(backup) : null,
        originalFingerprint:exportRoot === sourceRoot ? fingerprint(model) : originalFingerprint,
      };
      if (onExport) onExport(receipt);
      return receipt;
    } catch (e) {
      // Roll back an ordinary I/O failure, including failure to persist the
      // receipt. On a machine crash the retained original is recoverable.
      if (promoted) fs.rmSync(exportRoot,{recursive:true});
      if (backup) fs.renameSync(backup,exportRoot);
      throw e;
    }
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage,{recursive:true});
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
module.exports = {exportSite};
