'use strict';
const {mapping}=require('./case-fold.json');
const RX=require('./patterns');
// Native lowercase handles whole ordinary runs. Only full-fold exceptions need JS.
function fold(value){
 const bulk=part=>part.toLowerCase().replace(RX.foldSpecial,c=>mapping[c]??c);
 const parts=[];let start=0;RX.newerCase.lastIndex=0;
 // Preserve only newer-than-table runs; all surrounding text keeps the bulk path.
 for(const m of value.matchAll(RX.newerCase)){
  parts.push(bulk(value.slice(start,m.index)),m[0]);start=m.index+m[0].length;
 }
 const tail=bulk(value.slice(start));return parts.length?(parts.push(tail),parts.join('')):tail;
}
function search(source,query,limit){
 const text=fold(source),hits=[];if(!query.length||limit<=0)return hits;
 // Short no-hit probes stay native; the fixed threshold bounds their comparison work.
 if(query.length<=64&&text.indexOf(query)<0)return hits;
 const prefix=new Uint32Array(query.length);
 for(let i=1,matched=0;i<query.length;i++){
  const c=query.charCodeAt(i);while(matched&&query.charCodeAt(matched)!==c)matched=prefix[matched-1];
  if(query.charCodeAt(matched)===c)matched++;prefix[i]=matched;
 }
 // Map only requested boundaries; consume each exceptional character at most once.
 function boundaryCursor(){
  RX.foldSpecial.lastIndex=0;const changes=source.matchAll(RX.foldSpecial);let next=changes.next(),delta=0;
  return pos=>{
   while(!next.done){
    const m=next.value,part=mapping[m[0]]??m[0],start=m.index+delta,end=start+part.length;
    if(pos<start)return pos-delta;if(pos===start)return m.index;if(pos<end)return null;
    delta+=part.length-m[0].length;next=changes.next();
   }
   return pos-delta;
  };
 }
 const startBoundary=boundaryCursor(),endBoundary=boundaryCursor();
 const splitsPair=pos=>source.charCodeAt(pos-1)>=0xd800&&source.charCodeAt(pos-1)<=0xdbff&&source.charCodeAt(pos)>=0xdc00&&source.charCodeAt(pos)<=0xdfff;
 // KMP retains a matched suffix after a rejected boundary instead of rescanning it.
 for(let i=0,matched=0;i<text.length&&hits.length<limit;i++){
  const c=text.charCodeAt(i);while(matched&&query.charCodeAt(matched)!==c)matched=prefix[matched-1];
  if(query.charCodeAt(matched)===c)matched++;
  if(matched!==query.length)continue;
  const at=i+1-query.length,offset=startBoundary(at),end=endBoundary(i+1),valid=offset!==null&&end!==null&&!splitsPair(offset)&&!splitsPair(end);
  if(valid)hits.push({offset,context:source.slice(Math.max(0,offset-40),offset+Math.min(end-offset,100)+40)});
  matched=valid?0:prefix[matched-1];
 }
 return hits;
}
module.exports={fold,search};
