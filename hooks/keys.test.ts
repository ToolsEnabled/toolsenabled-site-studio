import {test, expect, mock} from 'claude-code/testing'
import {HELP, LIMIT} from './view-contract.mjs'
// Pane key routing in every state. A focused pane that is not a dialog claims only the hotkeys of
// Buttons it has mounted; any other key goes to the prompt composer, which then holds the keyboard,
// so later keys (q included) are typed there too. A pane opened with focus, closeOnEscape and
// holdToasts is a dialog and takes every key. keyboard() below applies exactly those rules.
const PANE='site-studio-view', plugin='toolsenabled-site-studio'
const opts={options:{site_directory:'/tmp/site',data_directory:'/tmp/state',export_directory:'/tmp/export'}}
const presentation={isFullscreen:false,columns:110}
const snap='c'.repeat(64)
const ADVERTISED=['p','n','r','b','1','2','3','4','5','6','7','8','q']
const DIGITS=['1','2','3','4','5','6','7','8']
const rowsOf=(view:string,total:number,offset:number)=>Array.from({length:Math.max(0,Math.min(LIMIT,total-offset))},(_,i)=>`${view} row ${offset+i+1}`)
const pageOf=(view:string,total:number,offset=0)=>({schema:'site-studio/view/1',view,rev:4,snapshot:snap,offset,limit:LIMIT,total,
 rows:rowsOf(view,total,offset),nextOffset:offset+LIMIT<total?offset+LIMIT:null})
const ok=(p:any)=>({exitCode:0,stdout:JSON.stringify(p),stderr:'',isStdoutTruncated:false,isStderrTruncated:false})
const viewOf=(e:any)=>e.argv[e.argv.indexOf('--max-old-space-size=384')+2]
const offsetOf=(e:any)=>Number(e.argv[e.argv.indexOf('--offset')+1])
const serve=(total:number)=>(e:any)=>ok(pageOf(viewOf(e),total,offsetOf(e)))
function world(on:any,reply:(e:any)=>any){
 const calls:any[]=[],opened:any[]=[],closed:any[]=[],leaked:string[]=[],opening:any=undefined
 mock.clock(on);mock.env(on,{PATH:'/usr/bin',SystemRoot:'C:\\Windows'})
 on('process.run',async(_:any,e:any)=>{calls.push(e);return {value:await reply(e)}})
 on('command.register',(_:any,e:any)=>({value:{command:e.name}}))
 on('ui.open',(_:any,e:any)=>{opened.push(e);return {value:{isPlaced:true}}})
 on('ui.close',(_:any,e:any)=>{closed.push(e);return {value:undefined}})
 for(const name of ['mcp.call','tool.call','prompt.submit','prompt.fill','session.append'])on(name,()=>{throw Error('Views must not use '+name)})
 return {calls,opened,closed,leaked,opening}
}
async function settle(w:any){if(w.opening){release();await w.opening}}
const isDialog=(o:any)=>o?.focus===true&&o?.closeOnEscape===true&&o?.holdToasts===true
function keyboard(ui:any,w:any){
 let composerHasKeys=false
 return async(key:string)=>{
  if(!composerHasKeys){
   const claimed=(await ui.findAll({type:'Button'})).filter((b:any)=>b.props.hotkey===key)
   if(claimed.length){await ui.press({key:claimed.at(-1).key});return}
   if(isDialog(w.opened.at(-1)))return
  }
  composerHasKeys=true;w.leaked.push(key)
 }
}
const mountPane=($:any)=>$.ui.mount({plugin,surface:'terminal',component:'Pane',requestId:PANE,props:{title:'Site Studio',bodyColumns:100},viewport:{columns:110,rows:26}})
async function open($:any,args:string){await $.command.run({command:'site-studio',args,origin:{kind:'composer'},presentation});return mountPane($)}
async function nextTwice($:any,args:string){const ui=await open($,args);await ui.press({key:'view-next'});await ui.press({key:'view-next'});return ui}
const helpLast=Math.floor((HELP.length-1)/LIMIT)*LIMIT,helpLastRows=HELP.length-helpLast
const rowKeys=(count:number)=>DIGITS.slice(0,count)
const outside=(count:number)=>count<LIMIT?String(count+1):'9'
type State={name:string,reply:(e:any)=>any,enter:($:any,w:any)=>Promise<any>,valid:string[],digit:string}
let release=()=>{}
const held=()=>new Promise(resolve=>{release=()=>resolve(ok(pageOf('pages',19)))})
const STATES:State[]=[
 {name:'first of three pages',reply:serve(19),enter:$=>open($,'pages'),valid:['n','r',...rowKeys(8)],digit:outside(8)},
 {name:'last page',reply:serve(19),enter:$=>nextTwice($,'pages'),valid:['p','r',...rowKeys(3)],digit:outside(3)},
 {name:'single six-row page',reply:serve(6),enter:$=>open($,'checkpoints'),valid:['r',...rowKeys(6)],digit:outside(6)},
 {name:'no entries',reply:serve(0),enter:$=>open($,'history'),valid:['r'],digit:'1'},
 {name:'help first page',reply:serve(0),enter:$=>open($,'help'),valid:['n',...rowKeys(8)],digit:outside(8)},
 {name:'help last page',reply:serve(0),enter:$=>nextTwice($,'help'),valid:['p',...rowKeys(helpLastRows)],digit:outside(helpLastRows)},
 {name:'row detail',reply:serve(6),enter:async $=>{const ui=await open($,'checkpoints');await ui.press({key:'view-row-0'});return ui},valid:['b'],digit:'3'},
 {name:'error',reply:()=>({...ok({}),exitCode:1,stderr:'VIEW_CHANGED: changed'}),enter:$=>open($,'home'),valid:['r'],digit:'1'},
 {name:'loading',reply:held,enter:async($,w)=>{
  w.opening=$.command.run({command:'site-studio',args:'pages',origin:{kind:'composer'},presentation})
  for(let n=0;n<50&&w.calls.length===0;n++)await Promise.resolve()
  return mountPane($)},valid:[],digit:'1'},
]
const PHRASES:[string,string][]=[['p','p previous'],['n','n next'],['r','r reload'],['b','b back']]
for(const state of STATES){
 test(`${state.name}: every advertised key is claimed, the footer lists only valid keys, the pane is a dialog`,opts,async($,on)=>{
  const w=world(on,state.reply),ui=await state.enter($,w)
  expect(isDialog(w.opened.at(-1))).toBe(true)
  const buttons=await ui.findAll({type:'Button'}),hotkeys=buttons.map((b:any)=>b.props.hotkey)
  for(const key of ADVERTISED)expect(hotkeys).toContain(key)
  for(const key of ADVERTISED){
   const live=buttons.filter((b:any)=>b.props.hotkey===key&&b.props.dimColor!==true)
   expect(live.length>0).toBe(key==='q'||state.valid.includes(key))
  }
  const footer=(await ui.find({key:'view-footer'}))?.text??''
  expect(footer).toContain('Esc/q close')
  for(const [key,phrase] of PHRASES)expect(footer.includes(phrase)).toBe(state.valid.includes(key))
  const rows=state.valid.filter(key=>DIGITS.includes(key)).length
  if(rows)expect(footer).toContain(rows===1?'1 row detail':`1–${rows} row detail`)
  else expect(footer.includes('row detail')).toBe(false)
  await settle(w)
 })
 for(const key of ['p','n','r',state.digit])test(`${state.name}: ${key} then q closes the pane and nothing reaches the prompt`,opts,async($,on)=>{
  const w=world(on,state.reply),ui=await state.enter($,w),press=keyboard(ui,w),before=w.calls.length
  await press(key)
  expect(w.leaked).toEqual([]);expect(w.closed.length).toBe(0)
  if(!state.valid.includes(key)){
   expect(w.calls.length).toBe(before)
   if(ADVERTISED.includes(key))expect(((await ui.find({key:'view-hint'}))?.text??'').length>0).toBe(true)
  }
  await press('q')
  expect(w.leaked).toEqual([]);expect(w.closed.length).toBe(1)
  await settle(w)
 })
}
