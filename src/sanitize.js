'use strict';
const RX=require('./patterns');
const entities=require('./html-entities.json');
const {balancedCss}=require('./css-rules');
const HTML = new Set('a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup data dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p picture pre q rp rt ruby s samp section small source span strong sub summary sup table tbody td th thead time tr u ul var wbr'.split(' '));
const SVG = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc lineargradient radialgradient stop clippath mask pattern image'.split(' '));
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set('script style textarea title xmp iframe noembed noframes plaintext'.split(' '));
const GLOBAL = new Set('id class title lang dir role hidden tabindex'.split(' '));
const ATTRS = new Set('href src alt width height loading decoding rel target datetime cite colspan rowspan scope start reversed value open span media type sizes'.split(' '));
const SVG_ATTRS = new Set('width height xmlns viewbox preserveaspectratio x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset fill-rule clip-rule opacity fill-opacity stroke-opacity transform href xlink:href xmlns:xlink offset stop-color stop-opacity gradientunits gradienttransform patternunits patterntransform patterncontentunits clippathunits maskunits maskcontentunits font-size font-family font-weight text-anchor dominant-baseline'.split(' '));
const camel={viewbox:'viewBox',preserveaspectratio:'preserveAspectRatio',lineargradient:'linearGradient',radialgradient:'radialGradient',clippath:'clipPath',gradientunits:'gradientUnits',gradienttransform:'gradientTransform',patternunits:'patternUnits',patterntransform:'patternTransform',patterncontentunits:'patternContentUnits',clippathunits:'clipPathUnits',maskunits:'maskUnits',maskcontentunits:'maskContentUnits'};
function escapeText(s) { return s.replace(RX.escapeText,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escapeAttr(s) {return escapeText(s).replace(RX.escapeQuote,'&quot;');}
function decode(s) {
  return s.replace(RX.entity,(m,h,d,n)=> {
    if(n) return Object.hasOwn(entities,n)?entities[n]:m;
    const cp=parseInt(h||d,h?16:10); if(cp===0||cp>0x10ffff||cp>=0xd800&&cp<=0xdfff) throw Error('invalid entity'); return String.fromCodePoint(cp);
  });
}
function safeUrl(value, allowExternal=false, fragmentOnly=false) {
  if(typeof value!=='string'||!value||RX.unsafeReference.test(value)) throw Error('unsafe reference');
  if(value.startsWith('#')) { if(!RX.fragmentReference.test(value)) throw Error('unsafe fragment'); return value; }
  if(fragmentOnly) throw Error('only fragment references allowed');
  if(RX.absoluteReference.test(value)) {
    if(!allowExternal||!RX.httpsReference.test(value)) throw Error('external reference refused');
    const u=new URL(value); if(u.username||u.password) throw Error('unsafe reference'); return value;
  }
  if(RX.encodedReference.test(value)) throw Error('encoded reference refused');
  return value;
}
function css(value, allowExternal=false) {
  if(typeof value!=='string'||!value.trim()||value.length>16384||!balancedCss(value)||RX.unsafeCss.test(value)||RX.executableCss.test(value)) throw Error('unsafe CSS');
  for(const part of value.split(';').filter(s=>s.trim())) {
    const colon=part.indexOf(':');const property=part.slice(0,colon).trim(),body=part.slice(colon+1).trim();
    if(colon<1||!RX.cssProperty.test(property)||!body)throw Error('invalid CSS declaration');
    let rest=body.replace(RX.cssUrl,(_,a,b,c)=> {safeUrl(a??b??c,allowExternal); return '';});
    if(RX.bannedCssValue.test(rest)) throw Error('unsafe CSS value');
  }
  return value.trim();
}
function attribute(name,value,{svg=false,allowExternal=false}={}) {
  name=name.toLowerCase();
  if(typeof value!=='string'||value.length>16384||name.startsWith('on')||name==='srcdoc'||!RX.svgAttributeName.test(name)) throw Error('unsafe attribute');
  if(name==='style') return [name,css(value,allowExternal)];
  if(!GLOBAL.has(name)&&!RX.ariaAttribute.test(name)&&!(svg?SVG_ATTRS:ATTRS).has(name)) throw Error('attribute not allowed');
  if(name==='xmlns'&&value!=='http://www.w3.org/2000/svg'||name==='xmlns:xlink'&&value!=='http://www.w3.org/1999/xlink') throw Error('invalid namespace');
  if(['href','xlink:href','src','cite'].includes(name)) safeUrl(value,allowExternal,svg&&!allowExternal);
  if(['fill','stroke'].includes(name)&&!RX.svgPaint.test(value)) {
    const m=value.match(RX.svgPaintReference); if(!m) throw Error('unsafe paint');
  }
  if(name==='target'&&value!=='_self') throw Error('only same-frame navigation allowed');
  return [camel[name]||name,value];
}
// Opening-tag attributes are quote-aware; comments, bogus declarations and end tags
// use their browser boundaries. Foreign content must not hide HTML tokens as RAW text.
function tokenize(source,{xml=false}={}) {
  const out=[];let i=0,svgDepth=0,mathDepth=0;
  while(i<source.length){
    if(source[i]!=='<'){const at=source.indexOf('<',i),end=at<0?source.length:at;out.push({text:source.slice(i,end),start:i,end});i=end;continue;}
    if(xml&&source.startsWith('<![CDATA[',i)){
      const at=source.indexOf(']]>',i+9);if(at<0)throw Error('unterminated CDATA');
      out.push({cdata:source.slice(i+9,at),start:i,end:at+3});i=at+3;continue;
    }
    if(source.startsWith('<!--',i)){
      let end=i+4;
      if(xml){const at=source.indexOf('-->',end);if(at<0)throw Error('unterminated comment');end=at+3;}
      else if(source[end]==='>')end++;
      else if(source.startsWith('->',end))end+=2;
      else {
        for(;end<source.length;end++)if(source[end]==='>'&&(source.slice(end-2,end)==='--'||source.slice(end-3,end)==='--!'))break;
        if(end===source.length)throw Error('unterminated comment');end++;
      }
      out.push({comment:true,start:i,end});i=end;continue;
    }
    if(source[i+1]==='!'||source[i+1]==='?'){
      let at;
      if(xml){
        if(source[i+1]==='?'){const close=source.indexOf('?>',i+2);at=close<0?source.length:close+1;}
        else {let quote='',subset=0;at=i+2;
          for(;at<source.length;at++){const c=source[at];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='[')subset++;else if(c===']'&&subset)subset--;else if(c==='>'&&!subset)break;}
        }
        if(at===source.length)throw Error('unterminated XML declaration');
      }else at=source.indexOf('>',i+2);
      if(at<0)throw Error('unterminated tag');
      out.push({declaration:source.slice(i,at+1),start:i,end:at+1});i=at+1;continue;
    }
    const closing=source[i+1]==='/';let head=i+(closing?2:1);
    if(!RX.nameStart.test(source[head]||'')){out.push({text:'<',start:i,end:i+1});i++;continue;}
    const begin=head;while(head<source.length&&RX.tagCharacter.test(source[head]))head++;
    let j=head,quote='';
    for(;j<source.length;j++){
      const c=source[j];if(closing){if(c==='>')break;}
      else if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;
    }
    if(j===source.length)throw Error('unterminated tag');
    let tail=j;while(tail>head&&RX.space.test(source[tail-1]))tail--;
    const self=source[tail-1]==='/';
    const t={tag:source.slice(begin,head).toLowerCase(),originalTag:source.slice(begin,head),closing,self,attrs:source.slice(head,self?tail-1:j),start:i,end:j+1};out.push(t);i=j+1;
    if(t.tag==='svg')svgDepth=closing?Math.max(0,svgDepth-1):svgDepth+(self?0:1);
    if(t.tag==='math')mathDepth=closing?Math.max(0,mathDepth-1):mathDepth+(self?0:1);
    if(!xml&&!closing&&!svgDepth&&!mathDepth&&RAW.has(t.tag)){
      t.rawElement=true;
      const re=RX['close_'+t.tag];re.lastIndex=i;const close=re.exec(source);
      if(!close){out.push({text:source.slice(i),rawTag:t.tag,start:i,end:source.length});i=source.length;}
      else {
        const end=source.indexOf('>',re.lastIndex);if(end<0)throw Error('unterminated tag');
        out.push({text:source.slice(i,close.index),rawTag:t.tag,start:i,end:close.index},{tag:t.tag,originalTag:t.originalTag,closing:true,attrs:source.slice(re.lastIndex,end),start:close.index,end:end+1});i=end+1;
      }
    }
  }
  return out;
}
function parseAttrs(raw,{preserveCase=false,decodeValue=decode}={}) {
  const result=[],names=new Set();let i=0;
  while(i<raw.length){
    const before=i;while(i<raw.length&&RX.space.test(raw[i]))i++;
    if(i===raw.length)break;
    if(i===before||!RX.nameStart.test(raw[i]))throw Error('invalid attribute syntax');
    const start=i++;while(i<raw.length&&RX.attributeCharacter.test(raw[i]))i++;
    const originalName=raw.slice(start,i),name=originalName.toLowerCase();if(names.has(name))throw Error('duplicate attribute');names.add(name);
    const nameEnd=i;while(i<raw.length&&RX.space.test(raw[i]))i++;
    let value='';
    if(raw[i]==='='){
      i++;while(i<raw.length&&RX.space.test(raw[i]))i++;
      const quote=raw[i]==='"'||raw[i]==="'"?raw[i++]:null,start=i;
      if(quote){const end=raw.indexOf(quote,i);if(end<0)throw Error('invalid attribute syntax');value=raw.slice(start,end);i=end+1;}
      else {while(i<raw.length&&!RX.unquotedAttributeEnd.test(raw[i]))i++;if(i===start)throw Error('invalid attribute syntax');value=raw.slice(start,i);}
    }else i=nameEnd;
    result.push([preserveCase?originalName:name,decodeValue(value)]);
  }
  return result;
}
function fragment(source,{svg=false,section=false,allowExternal=false}={}) {
  if(typeof source!=='string'||source.length>65536) throw Error('invalid fragment');
  const stack=[]; let roots=0,rootTag=''; let result='';
  for(const t of tokenize(source)) {
    if(t.comment||t.declaration) throw Error('declarations and comments not allowed');
    if(t.text!==undefined) {if(!stack.length&&t.text.trim()) throw Error('text outside root'); result+=escapeText(decode(t.text));continue;}
    const allowed=svg?SVG:HTML; if(!allowed.has(t.tag)) throw Error('element not allowed: '+t.tag);
    if(t.closing){if(t.attrs.trim()||stack.pop()!==t.tag) throw Error('unbalanced fragment'); result+='</'+(camel[t.tag]||t.tag)+'>';continue;}
    if(!stack.length){roots++;rootTag=t.tag;}
    result+='<'+(camel[t.tag]||t.tag);
    for(const [k,v] of parseAttrs(t.attrs)){const [name,val]=attribute(k,v,{svg,allowExternal}); result+=' '+name+'="'+escapeAttr(val)+'"';}
    if(svg&&t.self)result+='/>'; else {result+='>'; if(!VOID.has(t.tag)){if(t.self)throw Error('HTML self-closing nonvoid element'); stack.push(t.tag);}}
  }
  if(stack.length||roots!==1||svg&&rootTag!=='svg'||section&&rootTag!=='section') throw Error('invalid fragment root'); return result;
}
module.exports={HTML,SVG,VOID,RAW,escapeText,escapeAttr,decode,safeUrl,css,attribute,tokenize,parseAttrs,fragment};
