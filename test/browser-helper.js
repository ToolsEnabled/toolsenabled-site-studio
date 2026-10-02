'use strict';
const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
async function browser() {
  const binary=process.env.SITE_STUDIO_CHROME;if(!binary)throw Error('Browser tests require SITE_STUDIO_CHROME set to a Chrome/Chromium executable; see docs/TESTING.md.');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'site-studio-browser-'));const flags=['--headless','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-features=OptimizationHints,MediaRouter','--metrics-recording-only','--password-store=basic','--use-mock-keychain','--disable-dev-shm-usage','--window-size=1440,960','--user-data-dir='+profile];if(process.env.SITE_STUDIO_CHROME_NO_SANDBOX==='1')flags.push('--no-sandbox','--no-zygote');
  const child=spawn(binary,flags,{stdio:['ignore','ignore','pipe','pipe','pipe']});let buffer='',id=0,sessionId;const pending=new Map(),listeners=new Map(),eventWork=new Set(),eventErrors=[],loaded=new Set();let stderr='';child.stdio[3].on('error',e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}});child.stderr.on('data',b=>stderr+=b);const exited=new Promise(resolve=>child.once('close',resolve));child.on('error',e=>{for(const p of pending.values())p.reject(e);});
  child.stdio[4].on('data',b=>{buffer+=b.toString();let at;while((at=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,at);buffer=buffer.slice(at+1);const m=JSON.parse(raw),p=pending.get(m.id);if(m.method==='Page.lifecycleEvent'&&m.params.name==='load')loaded.add(m.params.loaderId);if(m.method)for(const listener of listeners.get(m.method)||[]){let result;try{result=listener(m.params);}catch(e){eventErrors.push(e);continue;}const work=Promise.resolve(result).catch(e=>eventErrors.push(e)).finally(()=>eventWork.delete(work));eventWork.add(work);}if(p){pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}}});
  function send(method,params={},browserLevel=false){return new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(Error(method+' timed out: '+stderr.slice(-1000)));},15000);pending.set(next,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id:next,method,params,...(!browserLevel&&sessionId?{sessionId}:{})})+'\0');});}
  let closing;
  function close(){
   if(closing)return closing;
   closing=(async()=>{let timer;try{
    if(child.pid&&child.exitCode===null&&child.signalCode===null){timer=setTimeout(()=>child.kill('SIGKILL'),3000);timer.unref();try{await send('Browser.close',{},true);}catch{child.kill('SIGTERM');}await exited;}
   }finally{clearTimeout(timer);for(const p of pending.values())clearTimeout(p.timer);pending.clear();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5});}})();return closing;
  }
  try{const target=await send('Target.createTarget',{url:'about:blank'},true);sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;await send('Page.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});await send('Runtime.enable');}catch(e){await close();throw e;}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
  async function until(expression){const deadline=Date.now()+15000;while(Date.now()<deadline){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error('Browser condition failed: '+expression);}
  async function settleEvents(){while(eventWork.size)await Promise.all([...eventWork]);if(eventErrors.length)throw eventErrors.shift();}
  async function navigate(url){
   await settleEvents();loaded.clear();const result=await send('Page.navigate',{url});if(result.errorText)throw Error(result.errorText);
   if(result.loaderId){const deadline=Date.now()+15000;while(!loaded.has(result.loaderId)){if(Date.now()>=deadline)throw Error('Navigation load timed out: '+url);await new Promise(r=>setTimeout(r,20));}}
   else await until('location.href === '+JSON.stringify(url));
   await settleEvents();
  }
  return {send,evaluate,until,close,settleEvents,navigate,on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);return ()=>listeners.get(method).delete(listener);}};
}
async function browserPreview(b,app){await b.navigate(app.launchUrl);await b.until('document.getElementById("status").textContent.includes("Revision 0")');return b.evaluate('state.previewUrl');}
module.exports={browser,browserPreview};
