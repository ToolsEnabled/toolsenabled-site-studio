'use strict';
function options(args){const out={};const map={'--site':'sourceRoot','--data-dir':'dataRoot','--export-dir':'exportRoot','--port':'port'};for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--allow-external'){out.allowExternal=true;continue;}if(!map[arg]||i+1===args.length||args[i+1].startsWith('--'))throw Error('Usage: node mcp-web.js [--site FOLDER] [--data-dir FOLDER] [--export-dir FOLDER] [--port 0] [--allow-external]');const val=args[++i];out[map[arg]]=arg==='--port'?Number(val):val;}return out;}
module.exports={options};
