'use strict';
const RX=require('./patterns');
const {DECODED_BYTES,limit}=require('./preview-limits');
const references=new Set('href src srcset poster cite style fill stroke filter mask clip-path cursor marker marker-start marker-mid marker-end action formaction data background longdesc manifest profile ping codebase classid archive usemap icon'.split(' '));
// Preview only: resolve bounded literal internal entities, never external,
// parameter or recursive entities. The original declaration is not served.
function xmlDecoder(tokens){
 const entities=new Map(Object.entries({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}));
 for(const token of tokens){
  const raw=token.declaration;if(!raw?.startsWith('<!DOCTYPE'))continue;
  let i=raw.indexOf('[');if(i<0)continue;
  while(i<raw.length){
   const at=raw.indexOf('<!ENTITY',i);if(at<0)break;i=at+8;
   if(!RX.space.test(raw[i]||''))continue;
   while(i<raw.length&&RX.space.test(raw[i]))i++;
   const start=i;while(i<raw.length&&RX.attributeCharacter.test(raw[i]))i++;
   const name=raw.slice(start,i);if(!name||name.length>128||!RX.nameStart.test(name[0]))continue;
   if(!RX.space.test(raw[i]||''))continue;
   while(i<raw.length&&RX.space.test(raw[i]))i++;
   const quote=raw[i++];if(quote!=='"'&&quote!=="'")continue;
   const end=raw.indexOf(quote,i);if(end<0)break;const value=raw.slice(i,end);i=end+1;
   while(i<raw.length&&RX.space.test(raw[i]))i++;
   if(raw[i]!=='>'||Buffer.byteLength(value)>4096||value.includes('&')||value.includes('%')||value.includes('<')||entities.has(name))continue;
   if(entities.size>=133)throw Error('too many XML entities');entities.set(name,value);
  }
 }
 let expanded=0;
 return (value,name='')=>{
  const custom=!references.has(name.toLowerCase().split(':').at(-1));
  expanded+=Buffer.byteLength(value);if(expanded>DECODED_BYTES)throw limit();
  return value.replace(RX.xmlEntity,(m,h,d,n)=>{
   let result;
   if(n)result=custom||['amp','lt','gt','quot','apos'].includes(n)?entities.get(n)??m:m;
   else {const cp=parseInt(h||d,h?16:10);if(cp===0||cp>0x10ffff||cp>=0xd800&&cp<=0xdfff)throw Error('invalid entity');result=String.fromCodePoint(cp);}
   expanded+=Math.max(0,Buffer.byteLength(result)-Buffer.byteLength(m));if(expanded>DECODED_BYTES)throw limit();return result;
  });
 };
}
module.exports={xmlDecoder};
