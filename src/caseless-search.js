'use strict';
const {mapping}=require('./case-fold.json');
const RX=require('./patterns');
// Native lowercase handles whole ordinary runs. Only full-fold exceptions need JS.
function fold(value){
 if(!RX.newerCase.test(value))return value.toLowerCase().replace(RX.foldSpecial,c=>mapping[c]??c);
 const parts=[];let start=0;RX.foldSpecial.lastIndex=0;
 for(const m of value.matchAll(RX.foldSpecial)){
  parts.push(value.slice(start,m.index).toLowerCase(),mapping[m[0]]??m[0]);start=m.index+m[0].length;
 }
 const tail=value.slice(start).toLowerCase();return parts.length?(parts.push(tail),parts.join('')):tail;
}
function search(source,query,limit){
 const text=fold(source),hits=[];let at=text.indexOf(query);if(at<0)return hits;
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
 while(at>=0&&hits.length<limit){
  const offset=startBoundary(at),end=endBoundary(at+query.length),valid=offset!==null&&end!==null&&!splitsPair(offset)&&!splitsPair(end);
  if(valid)hits.push({offset,context:source.slice(Math.max(0,offset-40),offset+Math.min(end-offset,100)+40)});
  at=text.indexOf(query,at+(valid?query.length:1));
 }
 return hits;
}
module.exports={fold,search};
