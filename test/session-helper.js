'use strict';
const assert=require('node:assert/strict');
async function openSession(launchUrl){
 const url=new URL(launchUrl);assert.equal(url.search,'');assert.match(url.hash,/^#cap=[a-f0-9]{64}$/);
 const res=await fetch(url.origin+'/api/session',{method:'POST',headers:{Origin:url.origin,'content-type':'application/json'},body:JSON.stringify({cap:new URLSearchParams(url.hash.slice(1)).get('cap')})});
 assert.equal(res.status,200);const {token}=await res.json();assert.match(token,/^[a-f0-9]{64}$/);
 return {token,headers:{'x-site-studio-control':token}};
}
async function issuePreview(base,headers){
 const res=await fetch(base+'/api/preview-session',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(res.status,200);
 const {previewUrl:url}=await res.json();return {url,headers:{Cookie:res.headers.get('set-cookie').split(';')[0]}};
}
async function previewSession(app){return issuePreview(app.previewUrl,(await openSession(app.launchUrl)).headers);}
// Another loopback server, as a second local web app on a different port would be: every response sets the cookies that
// cookies() returns when the request arrives. Preview cookies are not port-scoped, so it can shadow or evict them.
function foreignCookieServer(cookies){return require('node:http').createServer((req,res)=>{res.setHeader('Set-Cookie',cookies());res.end('<p>Other loopback server</p>');});}
module.exports={openSession,issuePreview,previewSession,foreignCookieServer};
