'use strict';
const {spawn,spawnSync}=require('node:child_process');const path=require('node:path');const {childEnv}=require('./helpers');
function start(o={},entry='mcp-web.js') {
  const args=[path.join(__dirname,'..',entry),'--site',o.sourceRoot,'--data-dir',o.dataRoot];if(o.exportRoot)args.push('--export-dir',o.exportRoot);
  const child=spawn(process.execPath,args,{env:childEnv(),stdio:['pipe','pipe','pipe']});let stderr='',buffer='',id=0;const pending=new Map();const output=[];
  child.stderr.on('data',b=>stderr+=b);child.stdout.setEncoding('utf8');child.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const m=JSON.parse(line);output.push(m);if(process.env.TEST_TRACE)process.stderr.write('received '+m.id+'\n');const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);p.resolve(m);}}catch(e){for(const p of pending.values())p.reject(e);}}});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.on('error',e=>{for(const p of pending.values())p.reject(e);});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const next=++id;if(process.env.TEST_TRACE)process.stderr.write('send '+next+' '+method+' '+(params?.name||'')+'\n');const timer=setTimeout(()=>reject(Error('RPC timeout '+method+': '+stderr)),process.platform==='win32'?30000:5000);pending.set(next,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:next,method,params})+'\n');});
  const tool=async(name,args={})=>{const m=await rpc('tools/call',{name,arguments:args});if(m.error||m.result.isError)throw Error(JSON.stringify(m));return JSON.parse(m.result.content[0].text);};
  const init=()=>rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'synthetic-test',version:'1'}});
  const stop=async()=>{if(process.env.TEST_TRACE)process.stderr.write('stop '+child.pid+' '+child.exitCode+'\n');if(child.exitCode!==null)return exited;child.stdin.end();let timer;try{return await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('shutdown timeout'));},process.platform==='win32'?30000:5000);})]);}finally{clearTimeout(timer);for(const p of pending.values())clearTimeout(p.timer);}};
  return {child,rpc,tool,init,stop,exited,output,get stderr(){return stderr;}};
}
// Runs mcp-web.js once to completion on the given stdin, with --site and --data-dir only and the same environment as start().
function runOnce(o,input){return spawnSync(process.execPath,[path.join(__dirname,'..','mcp-web.js'),'--site',o.sourceRoot,'--data-dir',o.dataRoot],{input,encoding:'utf8',timeout:process.platform==='win32'?30000:5000,env:childEnv()});}
module.exports={start,runOnce};
