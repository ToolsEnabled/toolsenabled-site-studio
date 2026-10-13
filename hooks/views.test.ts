import {test, expect, mock} from 'claude-code/testing'
import {readerLaunch} from './view-contract.mjs'
const PANE='site-studio-view', plugin='toolsenabled-site-studio'
const opts={options:{site_directory:'/tmp/site space $(literal)',data_directory:'/tmp/private state',export_directory:'/tmp/export'}}
const presentation={isFullscreen:false,columns:110}
const snap='a'.repeat(64)
const data=(offset=0,view='pages')=>({schema:'site-studio/view/1',view,rev:9,snapshot:snap,offset,limit:8,total:19,
 rows:Array.from({length:Math.min(8,19-offset)},(_,i)=>`page-${offset+i}.html`),nextOffset:offset+8<19?offset+8:null})
const ok=(p:any)=>({exitCode:0,stdout:JSON.stringify(p),stderr:'',isStdoutTruncated:false,isStderrTruncated:false})
function world(on:any, reply:(e:any)=>any=()=>ok(data())){
 const clock=mock.clock(on),calls:any[]=[],opened:any[]=[],closed:any[]=[],commands:any[]=[]
 mock.env(on,{PATH:'/usr/bin',SystemRoot:'C:\\Windows'})
 on('process.run',async(_:any,e:any)=>{calls.push(e);return {value:await reply(e)}})
 on('command.register',(_:any,e:any)=>{commands.push(e);return {value:{command:e.name}}})
 on('ui.open',(_:any,e:any)=>{opened.push(e);return {value:{isPlaced:true}}})
 on('ui.close',(_:any,e:any)=>{closed.push(e);return {value:undefined}})
 on('session.start',(_:any,e:any)=>({cwd:e.cwd}))
 for(const name of ['mcp.call','tool.call','prompt.submit','prompt.fill','session.append'])on(name,()=>{throw Error('Views must not use '+name)})
 return {clock,calls,opened,closed,commands}
}
async function open($:any,args='pages'){
 const result=await $.command.run({command:'site-studio',args,origin:{kind:'composer'},presentation})
 expect(result.context).toBe(undefined);expect(result.text).toBe(undefined)
 return $.ui.mount({plugin,surface:'terminal',component:'Pane',requestId:PANE,props:{title:'Site Studio',bodyColumns:100},viewport:{columns:110,rows:26}})
}
const press=($:any,key:string)=>$.ui.press({plugin,key,requestId:PANE,surface:'terminal'})
test('startup registers only the namespaced view and performs no read or background work',opts,async($,on)=>{
 const w=world(on);await $.session.start({cwd:'/tmp/project'});await w.clock.advance(65000)
 expect(w.commands.map(c=>c.name)).toEqual(['site-studio']);expect(w.commands[0].immediate).toBe(true);expect(w.calls.length).toBe(0)
})
test('pane uses own bounded child, literal configured paths, Escape and q; no context or polling',opts,async($,on)=>{
 const w=world(on);const ui=await open($);expect(JSON.stringify(await ui.drawn())).toContain('page-0.html')
 const node=w.calls[0].argv.indexOf('node');expect(node).toBeGreaterThanOrEqual(0)
 expect(w.calls[0].argv.slice(node,node+2)).toEqual(['node','--max-old-space-size=384'])
 expect(w.calls[0].argv[node+2]).toMatch(/\/tools\/site-studio-view\.js$/)
 expect(w.calls[0].argv).toContain('/tmp/site space $(literal)');expect(w.calls[0].init.timeoutMs).toBe(5000)
 expect(w.opened[0].closeOnEscape).toBe(true);expect(w.opened[0].focus).toBe(true)
 await w.clock.advance(65000);expect(w.calls.length).toBe(1);await press($,'view-close');expect(w.closed.length).toBe(1)
})
test('pages pin snapshot and changed states require explicit reload',opts,async($,on)=>{
 let changed=false;const w=world(on,e=>changed?{...ok({}),exitCode:1,stderr:'VIEW_CHANGED'}:ok(data(Number(e.argv[e.argv.indexOf('--offset')+1]))))
 const ui=await open($);await ui.drawn();await press($,'view-next');expect(JSON.stringify(await ui.drawn())).toContain('page-8.html')
 expect(w.calls[1].argv.slice(-2)).toEqual(['--snapshot',snap]);changed=true;await press($,'view-next');const drawn=JSON.stringify(await ui.drawn())
 expect(drawn).toContain('changed');expect(drawn.includes('page-8')).toBe(false);await w.clock.advance(60000);expect(w.calls.length).toBe(3)
 changed=false;await press($,'view-reload');expect(w.calls[3].argv.includes('--snapshot')).toBe(false)
})
test('untrusted child output is sanitized; malformed/truncated pages fail closed',opts,async($,on)=>{
 let mode=0;const w=world(on,()=>mode===0?ok({...data(),rows:data().rows.map(x=>x+'\u001b\u202e\u200b')}):mode===1?{...ok(data()),isStdoutTruncated:true}:ok({...data(),offset:8}))
 const ui=await open($);let drawn=JSON.stringify(await ui.drawn());expect(drawn.includes('\\u001b')).toBe(false);expect(drawn.includes('\u202e')).toBe(false)
 mode=1;await press($,'view-reload');expect(JSON.stringify(await ui.drawn())).toContain('unavailable')
 mode=2;await press($,'view-reload');expect(JSON.stringify(await ui.drawn())).toContain('unavailable');expect(w.calls.length).toBe(3)
})
test('unexpected arguments and actions never launch the view reader',opts,async($,on)=>{
 const w=world(on);for(const args of ['edit something','pages extra','--help','export; touch x']){
 const r=await $.command.run({command:'site-studio',args,origin:{kind:'composer'},presentation});expect(r.text).toContain('/site-studio');expect(r.context).toBe(undefined)
 }expect(w.calls.length).toBe(0)
})
test('help lists exact native action spellings without a state read',opts,async($,on)=>{
 const w=world(on),ui=await open($,'help');let drawn=JSON.stringify(await ui.drawn())
 await press($,'view-next');drawn+=JSON.stringify(await ui.drawn());await press($,'view-next');drawn+=JSON.stringify(await ui.drawn())
 for(const name of ['edit','new-page','checkpoint'])expect(drawn).toContain('/toolsenabled-site-studio:site-studio-'+name)
 expect(w.calls.length).toBe(0)
})
test('closing while a read is pending discards its eventual result',opts,async($,on)=>{
 let finish:any;const pending=new Promise(resolve=>{finish=resolve}),w=world(on,()=>pending)
 const opening=$.command.run({command:'site-studio',args:'pages',origin:{kind:'composer'},presentation})
 for(let n=0;n<30&&w.calls.length===0;n++)await Promise.resolve()
 const ui=await $.ui.mount({plugin,surface:'terminal',component:'Pane',requestId:PANE,props:{title:'Site Studio',bodyColumns:100},viewport:{columns:110,rows:26}})
 await ui.drawn();await press($,'view-close');finish(ok(data()));await opening
 expect(w.closed.length).toBe(1);expect(JSON.stringify(await ui.drawn()).includes('page-0')).toBe(false)
})
test('expanded commands keep quoted query/path data literal and page help without reading state',opts,async($,on)=>{
 const w=world(on,e=>ok(data(0,e.argv[e.argv.indexOf('--max-old-space-size=384')+2])))
 const help=await open($,'page "nested/my page.html"');expect(w.calls[0].argv).toContain('nested/my page.html')
 await $.command.run({command:'site-studio',args:'find "a; $(literal)"',origin:{kind:'composer'},presentation});expect(w.calls[1].argv).toContain('a; $(literal)')
 await $.command.run({command:'site-studio',args:'pages --assets',origin:{kind:'composer'},presentation});expect(w.calls[2].argv).toContain('--assets')
 await $.command.run({command:'site-studio',args:'help',origin:{kind:'composer'},presentation});await help.drawn();await press($,'view-next');expect(w.calls.length).toBe(3)
 expect(JSON.stringify(await help.drawn())).toContain('Codex')
})
test('pane starts exactly the shared reader launch, with an emptied environment holding only PATH',opts,async($,on)=>{
 const w=world(on);await open($);const call=w.calls[0]
 const expected=readerLaunch({root:call.init.cwd,view:'pages',args:[],assets:false,options:opts.options,offset:0,env:{PATH:'/usr/bin',SystemRoot:'C:\\Windows'}})
 expect(call.argv).toEqual(expected.argv);expect(call.init).toEqual(expected.init)
 // $.process.run sets init.env over the client's environment, so only an explicit empty environment drops inherited credentials.
 expect(call.argv.slice(0,3)).toEqual(['/usr/bin/env','-i','PATH=/usr/bin']);expect(call.argv[3]).toBe('node')
 expect(call.init.env).toBe(undefined)
})
