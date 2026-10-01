#!/usr/bin/env node
'use strict';
const {createCoordinator,createCoordinatorAsync}=require('./src/web-server');
async function run(args=process.argv.slice(2)){
 const startup=new AbortController();let app;
 for(const signal of ['SIGINT','SIGTERM','SIGHUP',...(process.platform==='win32'?['SIGBREAK']:[])])process.once(signal,()=>{startup.abort();void app?.close();});
 try{
  app=await createCoordinatorAsync(require('./src/options').options(args),startup.signal);
  await app.listen();
  if(!startup.signal.aborted)process.stderr.write('Site Studio dashboard session: '+app.launchUrl+'\n');
 }catch(e){await app?.close();if(!startup.signal.aborted){process.stderr.write(e.message+'\n');process.exitCode=1;}}
}
if(require.main===module)void run();
module.exports={createCoordinator,run};
