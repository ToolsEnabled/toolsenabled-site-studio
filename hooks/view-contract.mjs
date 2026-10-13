// Pure presentation shared by the local reader and Claude's hook sandbox.
export const VIEWS = ['home', 'pages', 'page', 'find', 'history', 'checkpoints', 'changes', 'check', 'dashboard', 'preview', 'export', 'doctor', 'help'];
export const LIMIT = 8;
export const HELP = [
  ...VIEWS.map(name=>{
    const usage={pages:'pages [--assets]',page:'page "path"',find:'find "text"',changes:'changes ["label"|original] ["path"]'}[name]||name;
    return '/site-studio '+usage+' · Codex: !node <installed-plugin>/tools/site-studio-view.js '+usage;
  }),
  ...['edit <request>','new-page <path> <title>','checkpoint <label>','draw <path.svg> <description>'].map(action=>
    '/toolsenabled-site-studio:site-studio-'+action+' · Codex: $site-studio:toolsenabled-site-studio '+action),
  'Use the full plugin prefix; unprefixed action names do not resolve in Claude Code 2.1.287.',
  'Actions start model work with normal tool permissions. Views never call MCP or a model.',
  'Pause, undo, restore, delete, export and session renewal belong to the human dashboard.',
  "Claude Code's /checkpoint and /undo aliases do not touch Site Studio.",
  'Quote paths, labels and queries containing spaces. Select a row for its full bounded text.',
  'Codex views use explicit --site/--data-dir or SITE_STUDIO_ROOT/DATA; absent values match server sample defaults. See install docs for the literal plugin path.',
];
export function parseRequest(raw) {
  if(typeof raw!=='string'||raw.length>16384)return null;
  const words=[];let word='',quote='',started=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quote){if(c===quote){quote='';continue;}if(c==='\\'&&(raw[i+1]===quote||raw[i+1]==='\\')){word+=raw[++i];continue;}word+=c;continue;}
    if(c==='"'||c==="'"){quote=c;started=true;continue;}
    if(c===' '||c==='\t'||c==='\n'||c==='\r'){if(started){words.push(word);word='';started=false;}continue;}
    word+=c;started=true;
  }
  if(quote)return null;if(started)words.push(word);
  const view=words.shift()||'home',assets=words.includes('--assets');
  if(!VIEWS.includes(view)||assets&&view!=='pages')return null;
  const args=words.filter(w=>w!=='--assets');
  if(args.some(a=>a.startsWith('--'))||view==='page'&&args.length!==1||view==='find'&&!args.length
    ||view==='changes'&&args.length>2||!['page','find','changes'].includes(view)&&args.length)return null;
  return {view,args:view==='find'?[args.join(' ')]:args,assets};
}
export function safeText(value, limit = 240) {
  if (typeof value !== 'string') return '';
  let out = '', count = 0;
  for (const ch of value) {
    if (count++ >= limit) return out + '…';
    const n = ch.codePointAt(0);
    const hidden = n < 32 || n >= 127 && n <= 159 || n === 173 || n === 847 || n === 1564 || n === 6158
      || n >= 1536 && n <= 1541 || n === 1757 || n === 1807 || n >= 2192 && n <= 2193 || n === 2274
      || n >= 4447 && n <= 4448 || n >= 6068 && n <= 6069 || n >= 6155 && n <= 6159
      || n >= 8203 && n <= 8207 || n >= 8232 && n <= 8238 || n >= 8288 && n <= 8303
      || n === 12644 || n >= 65024 && n <= 65039 || n === 65279 || n === 65440
      || n >= 65520 && n <= 65531 || n === 69821 || n === 69837 || n >= 78896 && n <= 78943
      || n >= 113824 && n <= 113827 || n >= 119155 && n <= 119162
      || n >= 917504 && n <= 921599 || n >= 55296 && n <= 57343;
    out += hidden ? '�' : ch;
  }
  return out;
}
export function snapshotId(value) {
  return typeof value === 'string' && value.length === 64 && [...value].every(c => '0123456789abcdef'.includes(c));
}
export function fitLine(value, columns) {
  let out='',used=0;const width=Math.max(12,columns-5);
  for(const c of value){const size=c.codePointAt(0)<256?1:2;if(used+size>width)return out+'…';out+=c;used+=size;}
  return out;
}
export function parsePage(p, view, offset = 0, snapshot) {
  if (!p || p.schema !== 'site-studio/view/1' || p.view !== view || !VIEWS.includes(view)
      || !snapshotId(p.snapshot) || snapshot !== undefined && p.snapshot !== snapshot
      || !Number.isSafeInteger(p.rev) || p.rev < 0 || p.offset !== offset || p.limit !== LIMIT
      || !Number.isSafeInteger(p.total) || p.total < 0 || p.total > 1000
      || !Array.isArray(p.rows) || p.rows.length !== Math.min(LIMIT, p.total - offset)
      || p.rows.some(row => typeof row !== 'string' || row.length > 1600)
      || p.nextOffset !== (offset + p.rows.length < p.total ? offset + p.rows.length : null)) throw Error('Invalid view page');
  return {...p, rows: p.rows.map(row => safeText(row, 750))};
}
// The pane's reader launch, shared by the hook and the real-child environment test.
// env holds the client values the hook read; root is the installed plugin folder.
// Claude Code sets process.run's init.env over its own environment, so passing a small env never
// removes the client's variables (API keys, messaging tokens). The reader instead starts through
// env -i with PATH alone, which the reader needs to find node; native Windows is not supported.
export const READER_ENV = ['PATH'];
export function readerLaunch({root, view, args = [], assets = false, options = {}, offset = 0, snapshot, env = {}}) {
  const argv = ['/usr/bin/env', '-i', ...READER_ENV.map(name => name + '=' + (env[name] || '')),
    'node', '--max-old-space-size=384', `${root}/tools/site-studio-view.js`, view, ...args,
    ...(assets ? ['--assets'] : []),
    '--site', String(options.site_directory || ''), '--data-dir', String(options.data_directory || ''),
    '--export-dir', String(options.export_directory || ''), '--json', '--offset', String(offset),
    ...(snapshot === undefined ? [] : ['--snapshot', snapshot])];
  return {argv, init: {cwd: root, timeoutMs: 5000}};
}
