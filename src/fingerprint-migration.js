'use strict';
const {hash}=require('./web-model');
const {allDirectories,bytes,fingerprint}=require('./web-import');
// Old states did not record the collation locale. Verify their saved digest
// against bounded candidate snapshots before assigning a canonical digest.
const languages='af am ar as az be bg bn bo br bs ca cs cy da de dz el en eo es et eu fa fi fil fo fr ga gl gu ha he hi hr hu hy id ig is it ja ka kk kl km kn ko kok ky lb ln lo lt lv mk ml mn mr ms mt my nb ne nl nn no om or pa pl ps pt ro ru sa se si sk sl so sq sr sv sw ta te th tk tr uk ur uz vi wae wo yo zh zh-Hant zu'.split(' ');
function migrateFingerprint(state,imported){
 const collators=[new Intl.Collator(),...Intl.Collator.supportedLocalesOf(languages).map(locale=>new Intl.Collator(locale))];
 const candidates=[imported,state.model,...state.undo,...state.redo,...state.checkpoints.map(c=>c.model)];
 for(const model of candidates){
  const directories=allDirectories(model),files=model.files.map(f=>[f.path,hash(bytes(f))]);
  for(const compare of [(a,b)=>0,...collators.map(c=>(a,b)=>c.compare(a[0],b[0]))]){
   if(hash(JSON.stringify({directories,files:[...files].sort(compare)}))===state.originalFingerprint)return fingerprint(model);
  }
 }
 throw Error('Cannot verify saved original fingerprint. Reopen with the previous locale or recover into a new state directory; original drift was not accepted.');
}
module.exports={migrateFingerprint};
