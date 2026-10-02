'use strict';
const RX=require('./patterns');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createStore,createStoreAsync} = require('./studio-store');
const {safePath} = require('./web-model');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const {previewBytes}=require('./preview-content');

function createCoordinator(options = {}, preparedStore) {
  if (options.host && options.host !== '127.0.0.1') throw Error('only 127.0.0.1 loopback is allowed');
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('invalid port');
  const store = preparedStore || createStore(options);
  let token = crypto.randomBytes(32).toString('hex');
  let readCapability=crypto.randomBytes(32).toString('hex'),previewId=crypto.randomBytes(12).toString('hex');
  let previewPrefix='/preview/'+previewId,previewCookie='site_studio_preview_'+previewId,previewAuthNotified=false;
  let launchCapability = crypto.randomBytes(32).toString('hex');
  let launchConsumed = false;
  const equal = (a,b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const hasPreview = req => {
    const matches=(req.headers.cookie||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(previewCookie+'='));
    return matches.length===1&&equal(matches[0].slice(previewCookie.length+1),readCapability);
  };
  const hasSession = req => launchConsumed && equal(req.headers['x-site-studio-control'],token);
  const nonce = crypto.randomBytes(24).toString('base64');
  const clients = new Set();
  let address, siteAddress, closing = false, closePromise;
  const origin = () => address ? 'http://127.0.0.1:' + address.port : null;
  const siteOrigin = () => siteAddress ? 'http://127.0.0.1:' + siteAddress.port : null;
  const status = () => ({...store.status, previewIssues:previewSnapshot===store.snapshot?[...previewIssues.values()]:[], previewUrl:siteOrigin()+previewPrefix, files:store.snapshot.files.map(({id,path,kind}) => ({id,path,kind}))});
  const notify = (extra={}) => {
    for (const client of clients) client.write('data: ' + JSON.stringify({rev:store.snapshot.rev,...extra}) + '\n\n');
  };
  const json = (res,code,value) => {
    if(code>=400)res.setHeader('Connection','close');
    res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(value));
  };
  function previewCsp() {
    const remote = options.allowExternal ? ' https:' : '';
    return "sandbox allow-same-origin; default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'" + remote +
      "; img-src 'self'" + remote + "; font-src 'self'" + remote + "; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors " + origin();
  }
  let previewSnapshot,previewCachePrefix,previewCache=new Map(),previewFailures=new Map(),previewIssues=new Map(),previewCacheBytes=0;
  function previewBody(file){
    if(previewSnapshot!==store.snapshot||previewCachePrefix!==previewPrefix){if(previewSnapshot!==store.snapshot){previewFailures.clear();previewIssues.clear();}previewSnapshot=store.snapshot;previewCachePrefix=previewPrefix;previewCache.clear();previewCacheBytes=0;}
    if(previewFailures.has(file))throw previewFailures.get(file);
    if(previewCache.has(file)){const body=previewCache.get(file);previewCache.delete(file);previewCache.set(file,body);return body;}
    let body;try{body=previewBytes(file,previewPrefix,{onNotice:message=>previewNotice(file,message)});}catch(e){previewFailures.set(file,e);throw e;}
    const budget=64*1024*1024;
    if(body.length<=budget){
      while(previewCacheBytes+body.length>budget){const first=previewCache.keys().next().value;previewCacheBytes-=previewCache.get(first).length;previewCache.delete(first);}
      previewCache.set(file,body);previewCacheBytes+=body.length;
    }
    return body;
  }
  function previewNotice(file,message){
    if(previewIssues.get(file)?.message===message)return;
    previewIssues.set(file,{path:file.path,message});notify();
  }
  function serveSite(res,relative) {
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    if (!safePath(relative)) return json(res,403,{error:'unsafe path'});
    const file = store.snapshot.files.find(f => f.path === relative);
    if (!file) return json(res,404,{error:'file not found'});
    const mime = MIME[path.extname(relative).toLowerCase()];
    if (!mime) return json(res,403,{error:'opaque asset is export-only'});
    let body;try{body=previewBody(file);}catch(e){previewNotice(file,'Preview unavailable: '+e.message+'. Original files are unchanged.');throw e;}
    res.writeHead(200, {'Content-Type':mime,'Content-Security-Policy':previewCsp()});
    res.end(body);
  }
  const handler = isPreview => async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try {
      const expected = isPreview ? siteOrigin() : origin();
      if (req.headers.host !== new URL(expected).host || req.headers.origin !== undefined && req.headers.origin !== expected) {
        return json(res,403,{error:'foreign Host or Origin refused'});
      }
      if (closing) return json(res,503,{error:'closing'});
      const raw = req.url.split('?')[0];
      if (!raw.startsWith('/') || RX.encodedPath.test(raw)) return json(res,403,{error:'unsafe path'});
      const pathname = decodeURIComponent(raw);
      if (isPreview) {
        if (req.method !== 'GET') return json(res,405,{error:'preview is read-only'});
        if(!pathname.startsWith(previewPrefix+'/'))return json(res,403,{error:'preview capability required'});
        if(!hasPreview(req)){
          if(!previewAuthNotified){previewAuthNotified=true;notify({previewUnauthorized:previewId});}
          return json(res,403,{error:'preview capability required'});
        }
        return serveSite(res,pathname.slice(previewPrefix.length+1));
      }
      if (pathname === '/open' && new URL(req.url,origin()).search) return json(res,403,{error:'Launch secrets belong in the URL fragment.'});
      if (req.method === 'POST' && pathname === '/api/session') {
        if(req.headers.origin!==origin())return json(res,403,{error:'same-origin exchange required'});
        if(req.headers['content-type']!=='application/json')return json(res,415,{error:'application/json required'});
        const body=await readJson(req);
        if(closing)return json(res,503,{error:'closing'});
        if(launchConsumed||Object.keys(body).length!==1||!equal(body.cap,launchCapability))return json(res,403,{error:'invalid or consumed launch secret'});
        launchConsumed=true;
        return json(res,200,{token});
      }
      if (req.method === 'GET' && ['/api/status', '/api/events'].includes(pathname) && !hasSession(req)) {
        return json(res,403,{error:'Dashboard session required. Open the private launch link or restart Site Studio.'});
      }
      if (req.method === 'GET' && pathname === '/api/status') return json(res,200,status());
      if (req.method === 'GET' && pathname === '/api/events') {
        if (clients.size >= 8) return json(res,429,{error:'preview client limit'});
        req.setTimeout(0);
        res.writeHead(200,{'Content-Type':'text/event-stream'});
        res.write('data: '+JSON.stringify({rev:store.snapshot.rev,...(previewAuthNotified?{previewUnauthorized:previewId}:{})})+'\n\n');
        clients.add(res);
        req.on('close',() => clients.delete(res));
        return;
      }
      if (req.method === 'POST') {
        if (req.headers['content-type'] !== 'application/json') return json(res,415,{error:'application/json required'});
        if (!['/api/control','/api/preview-session','/api/session/reissue'].includes(pathname)) return json(res,404,{error:'not found'});
        if (!hasSession(req)) return json(res,403,{error:'dashboard session required'});
        if (req.headers.origin !== origin()) return json(res,403,{error:'human same-origin action required'});
        const body = await readJson(req);
        if (closing) return json(res,503,{error:'closing'});
        if(!hasSession(req))return json(res,403,{error:'dashboard session required'});
        if(pathname==='/api/session/reissue'){
          if(Object.keys(body).length!==1||!Number.isInteger(body.expectedRev))return json(res,400,{error:'expectedRev required'});
          if(body.expectedRev!==store.snapshot.rev)return json(res,409,{error:'stale revision'});
          token=crypto.randomBytes(32).toString('hex');launchCapability=crypto.randomBytes(32).toString('hex');launchConsumed=false;
          readCapability=crypto.randomBytes(32).toString('hex');previewId=crypto.randomBytes(12).toString('hex');
          previewPrefix='/preview/'+previewId;previewCookie='site_studio_preview_'+previewId;previewAuthNotified=false;
          for(const client of clients)client.end();clients.clear();
          return json(res,200,{launchUrl:origin()+'/open#cap='+launchCapability});
        }
        if(pathname==='/api/preview-session'){
          const keys=Object.keys(body);
          if(keys.length&&!(keys.length===1&&keys[0]==='previewId'&&typeof body.previewId==='string'&&RX.previewId.test(body.previewId)))return json(res,400,{error:'empty object or previewId required'});
          let expired;
          if(!keys.length||body.previewId===previewId){
            expired=previewCookie+'=; Path='+previewPrefix+'/; Max-Age=0; HttpOnly; SameSite=Strict';
            readCapability=crypto.randomBytes(32).toString('hex');previewId=crypto.randomBytes(12).toString('hex');
            previewPrefix='/preview/'+previewId;previewCookie='site_studio_preview_'+previewId;previewAuthNotified=false;
          }
          const cookie=previewCookie+'='+readCapability+'; Path='+previewPrefix+'/; HttpOnly; SameSite=Strict';
          res.setHeader('Set-Cookie',expired?[cookie,expired]:cookie);
          json(res,200,{previewUrl:siteOrigin()+previewPrefix});notify();return;
        }
        const {action,...args} = body;
        const result = store.human(action,args);
        notify();
        return json(res,200,result);
      }
      if (req.method !== 'GET') return json(res,405,{error:'method not allowed'});
      // Drafts are served only from the separate preview origin.
      if (pathname.startsWith('/site/')) return json(res,403,{error:'use the authenticated dashboard preview'});
      res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src ${siteOrigin()}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
      if (pathname === '/' || pathname === '/open') {
        const template = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(template.replaceAll('__NONCE__',nonce));
      }
      if (pathname === '/web-app.js' || pathname === '/control.css') {
        res.writeHead(200,{'Content-Type':pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8'});
        return res.end(fs.readFileSync(path.join(__dirname,'../public',pathname.slice(1))));
      }
      json(res,404,{error:'not found'});
    } catch (e) {
      if (!res.headersSent) json(res,e.message === 'stale revision' ? 409 : e.message === 'editing is paused' ? 423 : 400,{error:e.message});
      else res.end();
    }
  };
  const server = http.createServer({connectionsCheckingInterval:250,requestTimeout:2000,headersTimeout:2000},handler(false));
  const previewServer = http.createServer({connectionsCheckingInterval:250,requestTimeout:2000,headersTimeout:2000},handler(true));
  for (const s of [server,previewServer]) {
    s.setTimeout(2000,socket=>socket.destroy());
    s.keepAliveTimeout=1000;
    s.maxRequestsPerSocket = 100;
    s.maxHeadersCount = 30;
  }
  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      for (const c of clients) c.end();
      for (const s of [server,previewServer]) if (s.listening) await new Promise(resolve => {
        s.close(resolve);
        s.closeAllConnections();
      });
      store.close();
    })();
    return closePromise;
  }
  const listenOne = (s,p) => new Promise((resolve,reject) => {
    s.once('error',reject);
    s.listen(p,'127.0.0.1',() => {if(closing){s.close(()=>reject(Error('startup cancelled')));return;}resolve(s.address());});
  });
  async function listen() {
    try {
      siteAddress = await listenOne(previewServer,0);
      address = await listenOne(server,port);
      return address;
    } catch (e) { await close(); throw e; }
  }
  return {
    get model() { return store.model; }, get status() { return store.status; },
    get workingRoot() { return store.workingRoot; },
    get launchUrl() { return origin() ? origin() + '/open#cap=' + launchCapability : null; },
    get previewUrl() { return origin(); }, get siteUrl() { return siteOrigin(); },
    edit(op) { const result = store.edit(op); notify(); return result; },
    checkpoint(label,rev) { const result = store.checkpoint(label,rev); notify(); return result; },
    human(action,args) { const result = store.human(action,args); notify(); return result; },
    server, previewServer, close, listen,
  };
}
function readJson(req) {
  return new Promise((resolve,reject) => {
    let size = 0;
    const chunks = [];
    req.setTimeout(5000,() => req.destroy(Error('request timed out')));
    req.on('data',chunk => {
      size += chunk.length;
      if (size > 65536) { reject(Error('request too large')); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end',() => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || Array.isArray(body) || typeof body !== 'object') throw Error('invalid JSON object');
        resolve(body);
      } catch (e) { reject(e); }
    });
    req.on('error',reject);
  });
}
async function createCoordinatorAsync(options={},signal){
 if(options.host&&options.host!=='127.0.0.1')throw Error('only 127.0.0.1 loopback is allowed');
 if(!Number.isInteger(options.port??0)||(options.port??0)<0||(options.port??0)>65535)throw Error('invalid port');
 const store=await createStoreAsync(options,signal);
 try{signal?.throwIfAborted();return createCoordinator(options,store);}catch(e){store.close();throw e;}
}
module.exports={createCoordinator,createCoordinatorAsync};
