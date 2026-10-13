#!/usr/bin/env node
'use strict';
// Local read-only command. It never imports or starts the MCP server/store.
const {view}=require('../src/site-view');
async function main(){
 const args=process.argv.slice(2),options={view:args.shift()||'home',sourceRoot:process.env.SITE_STUDIO_ROOT,dataRoot:process.env.SITE_STUDIO_DATA,args:[]};
 let json=false;const seen=new Set();
 const flags={'--site':'sourceRoot','--data-dir':'dataRoot','--export-dir':'exportRoot','--offset':'offset','--snapshot':'snapshot'};
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(!flag.startsWith('--')){options.args.push(flag);continue;}if(seen.has(flag))throw Error('VIEW_ARGUMENTS');seen.add(flag);
  if(flag==='--json'){json=true;continue;}
  if(flag==='--assets'){options.assets=true;continue;}
  if(flag==='--allow-external'){options.allowExternal=true;continue;}
  if(!Object.hasOwn(flags,flag)||i+1===args.length)throw Error('VIEW_ARGUMENTS');
  const val=args[++i];if(flag==='--offset'&&(!val||[...val].some(c=>!'0123456789'.includes(c))))throw Error('VIEW_ARGUMENTS');
  options[flags[flag]]=flag==='--offset'?Number(val):val;
 }
 const page=await view(options);
 if(json)process.stdout.write(JSON.stringify(page)+'\n');
 else {
  process.stdout.write('Site Studio · '+page.view+' · r'+page.rev+'\n'+(page.rows.join('\n')||'No entries.')+'\n');
  if(page.nextOffset!==null)process.stdout.write('Next page: repeat this command with --offset '+page.nextOffset+' --snapshot '+page.snapshot+'\n');
 }
}
main().catch(e=>{
 const messages={VIEW_CONFIG:'Set absolute SITE_STUDIO_ROOT and SITE_STUDIO_DATA, or --site and --data-dir.',VIEW_STATE:'Saved working copy unavailable. Check configuration and state file access.',VIEW_BINDING:'State belongs to another site.',VIEW_CHANGED:'Saved state changed. Reload from the first page.',VIEW_UPGRADE:'Open once with Site Studio to upgrade saved state.',VIEW_POLICY:'External-reference policy differs from the configured server. Use matching --allow-external settings.',VIEW_NOT_FOUND:'The selected file or checkpoint was not found.',VIEW_ARGUMENTS:'Usage: site-studio-view.js VIEW [quoted arguments] [--assets] [--site ABSOLUTE] [--data-dir ABSOLUTE] [--export-dir ABSOLUTE] [--allow-external] [--offset N --snapshot HASH] [--json]. Use help for view names.'};
 const code=Object.hasOwn(messages,e.message)?e.message:'VIEW_STATE';process.stderr.write(code+': '+messages[code]+'\n');process.exitCode=1;
});
