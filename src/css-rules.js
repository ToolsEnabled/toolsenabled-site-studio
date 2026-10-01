'use strict';
const RX=require('./patterns');
// Scan top-level rules once; quoted braces and comments are not delimiters.
function* cssRules(source){
 let start=-1,segment=0,parts=[],open=-1,depth=0,quote='',selector='';
 const reset=at=>{start=-1;segment=at;parts=[];};
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quote){
   if(c==='\\'){i++;if(source[i]==='\r'&&source[i+1]==='\n')i++;}
   else if(c===quote)quote='';
   else if(c==='\n'||c==='\r'||c==='\f'){quote='';if(depth===0)reset(i+1);}
   continue;
  }
  if(c==='/'&&source[i+1]==='*'){
   const end=source.indexOf('*/',i+2);if(end<0)return;
   if(depth===0){if(start>=0)parts.push(source.slice(segment,i));segment=end+2;}
   i=end+1;continue;
  }
  if(depth===0&&start<0&&!RX.space.test(c)){start=i;segment=i;}
  if(c==='\\'){i++;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c===';'&&depth===0){reset(i+1);continue;}
  if(c==='{'){
   if(depth===0){open=i;parts.push(source.slice(segment,i));selector=parts.join('').trim();}
   depth++;
  }else if(c==='}'){
   if(depth>0&&--depth===0)yield {start,end:i+1,selector,declarations:source.slice(open+1,i)};
   if(depth===0){reset(i+1);open=-1;}
  }
 }
}
function balancedCss(value){
 const stack=[];let quote='';
 for(let i=0;i<value.length;i++){
  const c=value[i];
  if(quote){if(c==='\\')i++;else if(c===quote)quote='';else if(c==='\n'||c==='\r'||c==='\f')return false;continue;}
  if(c==='"'||c==="'")quote=c;
  else if(c==='['||c==='(')stack.push(c);
  else if(c===']'||c===')'){if(stack.pop()!==(c===']'?'[':'('))return false;}
 }
 return !quote&&!stack.length;
}
module.exports={cssRules,balancedCss};
