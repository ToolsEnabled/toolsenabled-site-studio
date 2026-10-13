import type { Register } from 'claude-code'
import {LIMIT, HELP, parsePage, parseRequest, fitLine, readerLaunch} from './view-contract.mjs'

const PANE = 'site-studio-view'
let serial = 0, loading = false, error = '', selected = 'home'
let page: any = null
let request: any = {view:'home',args:[],assets:false}, detail: string | null = null, detailOffset = 0, hint = ''
// Every key the pane ever advertises is mounted in every state, so a stray key never reaches the prompt.
const DIGITS = ['1','2','3','4','5','6','7','8']
function reset() { serial++; loading = false; page = null; error = ''; detail = null; detailOffset = 0; hint = '' }
function redraw($: any) { $.ui.invalidate('ui.render') }
function say($: any, text: string) { hint = text; redraw($) }
async function load($: any, options: any, offset = 0, snapshot?: string) {
  const mine = ++serial, view = selected
  loading = true; error = ''; page = null; detail = null; hint = ''; redraw($)
  try {
    if(view==='help'){
      page={view,rev:0,snapshot:'0'.repeat(64),offset,total:HELP.length,rows:HELP.slice(offset,offset+LIMIT),nextOffset:offset+LIMIT<HELP.length?offset+LIMIT:null}
      return
    }
    const launch = readerLaunch({root: $.plugin.root, view, args: request.args, assets: request.assets, options, offset, snapshot,
      env: {PATH: await $.env.get('PATH') || ''}})
    const result = await $.process.run(launch.argv, launch.init)
    if (mine !== serial) return
    if (result.exitCode !== 0 || result.isStdoutTruncated || result.isStderrTruncated) {
      if (String(result.stderr).startsWith('VIEW_CHANGED')) error = 'The working copy changed. Reload to read its current state.'
      else if (String(result.stderr).startsWith('VIEW_CONFIG')) error = 'Configure absolute site, state and export folders in /plugin configure toolsenabled-site-studio.'
      else if (String(result.stderr).startsWith('VIEW_BINDING')) error = 'This state folder belongs to another site. Check plugin configuration.'
      else if (String(result.stderr).startsWith('VIEW_POLICY')) error = 'External-reference policy mismatch. See /site-studio doctor.'
      else if (String(result.stderr).startsWith('VIEW_UPGRADE')) error = 'Open once with Site Studio to upgrade the saved state. This view never upgrades it.'
      else if (String(result.stderr).startsWith('VIEW_NOT_FOUND')) error = 'The selected file or checkpoint was not found.'
      else error = 'Working copy unavailable. Check configuration and access, then Reload.'
      return
    }
    if (typeof result.stdout !== 'string' || result.stdout.length > 32000) throw Error('Oversized page')
    page = parsePage(JSON.parse(result.stdout), view, offset, snapshot)
  } catch { if (mine === serial) error = 'Working copy unavailable. Check configuration and access, then Reload.' }
  finally { if (mine === serial) { loading = false; redraw($) } }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    reset()
    await $.command.register({name:'site-studio', description:'View the working copy, pages, history and checkpoints locally',
      argumentHint:'[home|pages|page|find|history|checkpoints|changes|check|dashboard|export|doctor|help]', immediate:true})
    return next(e)
  })
  on('session.end', async ($, e, next) => { reset(); return next(e) })
  on('ui.close', {id:PANE}, async ($, e, next) => { reset(); return next(e) })
  on('command.run', {command:'site-studio'}, async ($, e) => {
    const parsed = parseRequest(e.args)
    if (!parsed) return {text:'Use /site-studio help for views and action commands.'}
    reset(); request=parsed; selected = parsed.view
    // focus, closeOnEscape and holdToasts make the pane a dialog: it keeps every key while open.
    await $.ui.open({id:PANE, title:'Site Studio', focus:true, closeOnEscape:true, holdToasts:true, rows:22, columns:100})
    await load($, options)
    return {} // Pane bodies never enter the transcript or model context.
  })
  on('ui.render', {component:'Pane', requestId:PANE}, async ($, e) => {
    const {Box, Text, Button} = $.ui.resolve(e), current = page
    const close = async () => { reset(); await $.ui.close({id:PANE}) }
    // An inapplicable control stays mounted, drawn dim, and only explains itself.
    const control = (key: string, hotkey: string, label: string, active: boolean, act: () => any, why: string) =>
      <Button key={key} hotkey={hotkey} dimColor={!active} onPress={active ? act : () => say($, why)}>{label}</Button>
    const guards = (digits: string[], why: (digit: string) => string) => digits.length ? <Box key="view-guards">
      {digits.map(digit => <Button key={`view-guard-${digit}`} hotkey={digit} plain dimColor onPress={() => say($, why(digit))}>–</Button>)}
    </Box> : null
    // Keyed Boxes name the hint and footer lines (a Text drops its key).
    const hintLine = hint ? <Box key="view-hint"><Text dimColor>{hint}</Text></Box> : null
    const closeButton = <Button key="view-close" hotkey="q" onPress={close}>Close</Button>
    if(detail!==null){
      const points=Array.from(detail),width=Math.max(12,Math.floor(((e.props as any).bodyColumns||80)*0.45)),parts=[]
      for(let i=0;i<points.length;i+=width)parts.push(points.slice(i,i+width).join(''))
      const earlier = detailOffset > 0, later = detailOffset + 8 < parts.length
      const footer = ['Bounded text', earlier ? 'p previous' : '', later ? 'n next' : '', 'b back to the page', 'Esc/q close'].filter(Boolean).join(' · ')
      return <Box flexDirection="column"><Text bold>Site Studio · {selected} · row detail</Text>
        {parts.slice(detailOffset,detailOffset+8).map((part,i)=><Text key={`detail-${i}`}>{part}</Text>)}
        {hintLine}
        <Box>
          {control('detail-prev','p','Previous',earlier,()=>{detailOffset=Math.max(0,detailOffset-8);hint='';redraw($)},'Already at the start of this row.')}
          {control('detail-next','n','Next',later,()=>{detailOffset+=8;hint='';redraw($)},'Already at the end of this row.')}
          {control('detail-reload','r','Reload',false,()=>{},'Press b to return to the page, then r to reload.')}
          <Button key="detail-back" hotkey="b" onPress={()=>{detail=null;detailOffset=0;hint='';redraw($)}}>Back</Button>
          {closeButton}
        </Box>
        {guards(DIGITS, () => 'Press b to return to the page, then choose a row.')}
        <Box key="view-footer"><Text dimColor>{footer}</Text></Box></Box>
    }
    const ready = !loading && current !== null
    const earlier = ready && current.offset > 0, later = ready && current.nextOffset !== null && current.nextOffset !== undefined
    const reloadable = !loading && selected !== 'help', rows = ready ? current.rows.length : 0
    const unavailable = loading ? 'Still loading. Press q to close.' : 'No page is loaded. Press r to reload.'
    const footer = ['Read-only', rows > 1 ? `1–${rows} row detail` : rows === 1 ? '1 row detail' : '', earlier ? 'p previous' : '',
      later ? 'n next' : '', reloadable ? 'r reload' : '', 'Esc/q close'].filter(Boolean).join(' · ')
    return <Box flexDirection="column">
      <Text bold>Site Studio · {selected}{current ? ` · r${current.rev}` : ''}</Text>
      {current ? <Text dimColor>{selected==='help'?'Static help':`Snapshot ${current.snapshot.slice(0,12)}`}</Text> : null}
      {loading ? <Text>Loading saved working copy…</Text> : error ? <Text>{error}</Text> : null}
      {current?.rows.map((row:string, i:number)=><Button key={`view-row-${i}`} hotkey={String(i+1)} onPress={()=>{
        if(page===current){detail=row;detailOffset=0;hint='';redraw($)}
      }}>{fitLine(row,(e.props as any).bodyColumns||80)}</Button>)}
      {current?.total === 0 ? <Text>No entries.</Text> : null}
      {current && current.total > 0 ? <Text dimColor>{current.offset+1}–{current.offset+current.rows.length} of {current.total}</Text> : null}
      {hintLine}
      <Box>
        {control('view-prev','p','Previous',earlier,async()=>{
          if(page===current)await load($,options,Math.max(0,current.offset-LIMIT),current.snapshot)
        },ready?'Already on the first page.':unavailable)}
        {control('view-next','n','Next',later,async()=>{
          if(page===current)await load($,options,current.nextOffset,current.snapshot)
        },ready?'Already on the last page.':unavailable)}
        {control('view-reload','r','Reload',reloadable,()=>load($,options),loading?'Already loading.':'Help is static; nothing to reload.')}
        {control('view-back','b','Back',false,()=>{},'Already on the page; b returns from row detail.')}
        {closeButton}
      </Box>
      {guards(DIGITS.slice(rows), digit => ready ? (rows ? `No row ${digit} on this page.` : 'No rows on this page.') : unavailable)}
      <Box key="view-footer"><Text dimColor>{footer}</Text></Box>
    </Box>
  })
}
