'use strict';
const RX=require('./patterns');
const {bytes}=require('./web-import');
const {tokenize,parseAttrs,escapeAttr}=require('./sanitize');
function previewBytes(file,prefix){
 const local=value=>{
  if(!value||value.startsWith('#')||RX.absoluteReference.test(value))return value;
  let u;try{u=new URL(value,'http://site.invalid/'+file.path);}catch{return value;}
  return u.origin==='http://site.invalid'?prefix+u.pathname+u.search+u.hash:value;
 };
 function css(source){
  const out=[];let i=0,start=0;
  // Consume each string/comment/url once, including malformed tails.
  function quoted(at){const q=source[at];let end=at+1;for(;end<source.length;end++){if(source[end]==='\\'){end++;continue;}if(source[end]===q)return end;}return source.length;}
  while(i<source.length){
   if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
   if(source[i]==='"'||source[i]==="'"){i=quoted(i)+1;continue;}
   const isUrl=source.slice(i,i+4).toLowerCase()==='url(',isImport=source.slice(i,i+7).toLowerCase()==='@import';
   if(!isUrl&&!isImport){i++;continue;}
   let a=i+(isUrl?4:7);while(RX.space.test(source[a]||'')&&a<source.length)a++;
   const quote=source[a]==='"'||source[a]==="'";
   if(isImport&&!quote){i=a;continue;}
   let b=quote?quoted(a):source.indexOf(')',a);if(b<0)b=source.length;
   const begin=a+(quote?1:0),value=source.slice(begin,b).trim();
   if(!value.includes('\\')&&b<source.length){const replacement=local(value);if(replacement!==value){out.push(source.slice(start,begin),replacement);start=b;}}
   i=Math.min(source.length,b+1);
  }
  out.push(source.slice(start));return out.join('');
 }
 if(file.kind==='css')return Buffer.from(css(file.source));
 const svg=file.path.toLowerCase().endsWith('.svg');
 if(file.kind!=='html'&&!svg)return bytes(file);
 const source=svg?new TextDecoder('utf-8',{fatal:true}).decode(bytes(file)):file.source;
 const out=[];let rawKept=false;
 for(const t of tokenize(source)){
  const raw=source.slice(t.start,t.end);
  if(t.text!==undefined){out.push(t.rawTag?(rawKept?(t.rawTag==='style'?css(raw):raw):raw.replaceAll('<','&lt;')):raw.replaceAll('<','&lt;'));continue;}
  if(t.comment)continue;
  if(t.declaration){if(!svg&&raw.slice(0,9).toLowerCase()==='<!doctype')out.push('<!doctype html>');continue;}
  if(t.closing){out.push('</'+t.originalTag+'>');continue;}
  if(t.rawElement)rawKept=false;
  const tag=t.tag.split(':').at(-1);
  if(tag==='base')continue;
  let attrs;try{attrs=parseAttrs(t.attrs,{preserveCase:true});}catch{continue;}
  if(tag==='meta'&&attrs.some(([k,v])=>k.toLowerCase()==='http-equiv'||k.toLowerCase()==='name'&&v.trim().toLowerCase()==='referrer'))continue;
  if(t.rawElement)rawKept=true;
  const localName=name=>name.toLowerCase().split(':').at(-1);
  let changed=attrs.some(([k])=>localName(k)==='referrerpolicy');
  const rewritten=attrs.filter(([k])=>localName(k)!=='referrerpolicy').map(([name,v])=>{
   const k=name.toLowerCase();let next=v;
   if(['href','src','poster','cite','xlink:href'].includes(k))next=local(v);
   else if(k==='style')next=css(v);
   else if(k==='srcset')next=v.split(',').map(part=>{const [url,...descriptor]=part.trim().split(RX.spaces);return [local(url),...descriptor].join(' ');}).join(', ');
   if(next!==v)changed=true;return [name,next];
  });
  if(['a','area','link'].includes(tag)){
   const rel=rewritten.find(([k])=>k.toLowerCase()==='rel');
   if(rel){if(!rel[1].toLowerCase().split(RX.spaces).includes('noreferrer')){rel[1]+=' noreferrer';changed=true;}}
   else {rewritten.push(['rel','noreferrer']);changed=true;}
  }
  out.push(changed?'<'+t.originalTag+rewritten.map(([k,v])=>' '+k+'="'+escapeAttr(v)+'"').join('')+(t.self?'/>':'>'):raw);
 }
 return Buffer.from(out.join(''));
}
module.exports={previewBytes};
