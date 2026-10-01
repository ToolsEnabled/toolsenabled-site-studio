'use strict';
const assert=require('node:assert/strict');
async function openSession(launchUrl){
 const url=new URL(launchUrl);assert.equal(url.search,'');assert.match(url.hash,/^#cap=[a-f0-9]{64}$/);
 const res=await fetch(url.origin+'/api/session',{method:'POST',headers:{Origin:url.origin,'content-type':'application/json'},body:JSON.stringify({cap:new URLSearchParams(url.hash.slice(1)).get('cap')})});
 assert.equal(res.status,200);const {token}=await res.json();assert.match(token,/^[a-f0-9]{64}$/);
 return {token,headers:{'x-site-studio-control':token}};
}
async function previewBase(app){const {headers}=await openSession(app.launchUrl);return (await (await fetch(app.previewUrl+'/api/status',{headers})).json()).previewUrl;}
module.exports={openSession,previewBase};
