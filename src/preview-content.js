'use strict';
const RX=require('./patterns');
const limits=require('./preview-limits');
const {bytes}=require('./web-import');
const {xmlDecoder}=require('./xml-preview');
const {tokenize,parseAttrs,escapeAttr,escapeText,decodeAttribute}=require('./sanitize');
function htmlDoctype(raw){
 if(raw.slice(0,9).toLowerCase()!=='<!doctype'||!RX.space.test(raw[9]||'')||raw.slice(1).includes('<'))return '';
 let quote='';for(let i=9;i<raw.length-1;i++){const c=raw[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;}
 return quote?'':raw;
}
function previewBytes(file,prefix,{onNotice=()=>{}}={}){
 let attributeNotice=false;
 function omitted(){if(!attributeNotice){attributeNotice=true;onNotice('Preview omitted one or more attributes exceeding the 64 KiB attribute budget. Original files are unchanged.');}return null;}
 const local=value=>{
  if(!value||value.startsWith('#')||RX.absoluteReference.test(value))return value;
  let u;try{u=new URL(value,'http://site.invalid/'+file.path);}catch{return value;}
  return u.origin==='http://site.invalid'?prefix+u.pathname+u.search+u.hash:value;
 };
 function css(source,budget=limits.OUTPUT_BYTES){
  const out=limits.writer(budget);let i=0,start=0;
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
  out.push(source.slice(start));return out.join();
 }
 if(file.kind==='css')return Buffer.from(css(file.source));
 const svg=file.path.toLowerCase().endsWith('.svg');
 if(file.kind!=='html'&&!svg)return bytes(file);
 const source=svg?new TextDecoder('utf-8',{fatal:true}).decode(bytes(file)):file.source;
 const tokens=tokenize(source,{xml:svg,maxTokens:limits.TOKENS}),decodeValue=svg?xmlDecoder(tokens):decodeAttribute;
 const out=limits.writer();let rawKept=false,xmlStyle=false;
 for(const t of tokens){
  const raw=source.slice(t.start,t.end);
  if(t.cdata!==undefined){out.push('<![CDATA['+(xmlStyle?css(t.cdata):t.cdata).replaceAll(']]>',']]]]><![CDATA[>')+']]>');continue;}
  if(svg&&t.text!==undefined){out.push(escapeText(xmlStyle?css(decodeValue(raw,'style')):decodeValue(raw)));continue;}
  if(t.text!==undefined){out.push(t.rawTag?(rawKept?(t.rawTag==='style'?css(raw):raw).replaceAll('<','&lt;'):raw.replaceAll('<','&lt;')):raw.replaceAll('<','&lt;'));continue;}
  if(t.comment)continue;
  if(t.declaration){if(!svg)out.push(htmlDoctype(raw));continue;}
  if(t.closing){if(svg&&t.tag.split(':').at(-1)==='style')xmlStyle=false;out.push('</'+t.originalTag+'>');continue;}
  if(t.rawElement)rawKept=false;
  const tag=t.tag.split(':').at(-1);if(svg&&tag==='style'&&!t.self)xmlStyle=true;
  if(tag==='base')continue;
  let attrs;try{attrs=parseAttrs(t.attrs,{preserveCase:true,decodeValue:(value,name)=>{if(Buffer.byteLength(value)>limits.ATTRIBUTE_BYTES)return omitted();const decoded=decodeValue(value,name);return Buffer.byteLength(decoded)>limits.ATTRIBUTE_BYTES?omitted():decoded;}});}catch(e){if(e.code==='PREVIEW_LIMIT')throw e;continue;}
  if(tag==='meta'&&attrs.some(([k,v])=>k.toLowerCase()==='http-equiv'||k.toLowerCase()==='name'&&v.trim().toLowerCase()==='referrer'))continue;
  if(t.rawElement)rawKept=true;
  const localName=name=>name.toLowerCase().split(':').at(-1);
  const rewritten=attrs.filter(([k])=>localName(k)!=='referrerpolicy').flatMap(([name,v])=>{
   try{
   const k=name.toLowerCase();let next=v;
   if(['href','src','poster','cite','xlink:href'].includes(k))next=local(v);
   else if(k==='style')next=css(v,limits.ATTRIBUTE_BYTES);
   else if(k==='srcset'){
    const items=limits.writer(limits.ATTRIBUTE_BYTES);let at=0;
    while(at<=v.length){let end=v.indexOf(',',at);if(end<0)end=v.length;const [url,...descriptor]=v.slice(at,end).trim().split(RX.spaces);if(at)items.push(', ');items.push([local(url),...descriptor].join(' '));at=end+1;}
    next=items.join();
   }
   return [[name,limits.check(next,limits.ATTRIBUTE_BYTES)]];
   }catch(e){if(e.code!=='PREVIEW_LIMIT')throw e;omitted();return [];}
  });
  if(['a','area','link'].includes(tag)){
   const rel=rewritten.find(([k])=>k.toLowerCase()==='rel');
   if(rel){if(!rel[1].toLowerCase().split(RX.spaces).includes('noreferrer')){rel[1]+=' noreferrer';}}
   else rewritten.push(['rel','noreferrer']);
  }
  out.push('<'+t.originalTag+rewritten.map(([k,v])=>' '+k+'="'+escapeAttr(v)+'"').join('')+(t.self?'/>':'>'));
 }
 return Buffer.from(out.join());
}
module.exports={previewBytes};
