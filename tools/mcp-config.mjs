import RX from '../src/patterns.js';
import {absolutePath} from '../src/options.js';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const usage='Usage: node tools/mcp-config.mjs --client claude|codex|cursor|claude-desktop|deepseek [--site FOLDER] [--data-dir FOLDER] [--export-dir FOLDER]';
const quote=value=>process.platform==='win32'?"'"+value.replace(RX.powershellQuote,c=>c+c)+"'":"'"+value.replaceAll("'","'\\''")+"'";
export function clientConfig(client,{site=resolve(root,'site'),dataDir,exportDir,node=process.execPath,appRoot=root}={}){
 const row={command:node,args:[resolve(absolutePath(appRoot,'plugin directory'),'mcp-web.js'),'--site',absolutePath(site,'site directory')]};
 if(dataDir!==undefined)row.args.push('--data-dir',absolutePath(dataDir,'state directory'));if(exportDir!==undefined)row.args.push('--export-dir',absolutePath(exportDir,'export directory'));
 if(client==='claude')return 'claude mcp add --transport stdio site-studio -- '+[row.command,...row.args].map(quote).join(' ')+'\n';
 if(client==='codex')return 'codex mcp add site-studio -- '+[row.command,...row.args].map(quote).join(' ')+'\n';
 if(client==='cursor'||client==='claude-desktop')return JSON.stringify({mcpServers:{'site-studio':row}},null,2)+'\n';
 if(client==='deepseek')return '- id: mcp-site-studio\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: site-studio\n    transport: stdio\n    command: '+JSON.stringify(node)+'\n    args: '+JSON.stringify(row.args)+'\n    toolCallTimeoutMs: 30000\n';
 throw Error(usage);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{let client;const o={};const map={'--site':'site','--data-dir':'dataDir','--export-dir':'exportDir'};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i],v=process.argv[i+1];if(!v)throw Error(usage);if(k==='--client')client=v;else if(map[k])o[map[k]]=v;else throw Error(usage);}process.stdout.write(clientConfig(client,o));}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
