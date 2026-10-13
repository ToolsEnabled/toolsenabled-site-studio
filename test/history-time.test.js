'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,textOp}=require('./helpers'),{createStore}=require('../src/studio-store'),{view}=require('../src/site-view');
test('new history records persist actual UTC times for edits, checkpoints and every human control',t=>{
 const o=fixture(t),start=Date.now();let s=createStore(o);t.after(()=>s.close());
 s.checkpoint('Before',0);s.edit(textOp(s.model));
 for(const action of ['pause','resume','undo','redo'])s.human(action,{expectedRev:s.model.rev});
 s.human('restore',{expectedRev:s.model.rev,label:'Before'});
 s.human('checkpoint',{expectedRev:s.model.rev,label:'Human saved'});
 s.human('delete_checkpoint',{expectedRev:s.model.rev,label:'Human saved'});
 s.human('export',{expectedRev:s.model.rev,confirmed:true});
 const recorded=s.status.history,end=Date.now();
 assert.deepEqual(recorded.map(h=>h.type),['open','checkpoint','set_text','pause','resume','undo','redo','restore','checkpoint','delete_checkpoint','export']);
 for(const h of recorded){assert.equal(typeof h.at,'string',h.type);const time=Date.parse(h.at);assert(time>=start&&time<=end,h.type);assert.equal(new Date(time).toISOString(),h.at);}
 s.close();s=createStore(o);assert.deepEqual(s.status.history,recorded,'restart must preserve times instead of restamping');
});
test('history panes show recorded times and label legacy or invalid times without rewriting them',async t=>{
 const o=fixture(t);let s=createStore(o);s.edit(textOp(s.model));s.close();
 const file=path.join(o.dataRoot,'state.json'),state=JSON.parse(fs.readFileSync(file));
 delete state.history[0].at;state.history[1].at='2026-10-02T17:30:12.345Z';fs.writeFileSync(file,JSON.stringify(state));
 let before=fs.readFileSync(file),page=await view({...o,view:'history'});
 assert(page.rows[0].includes(state.history[1].at));assert(page.rows[1].includes('Time not recorded'));
 assert.deepEqual(fs.readFileSync(file),before);
 s=createStore(o);assert.equal(Object.hasOwn(s.status.history[0],'at'),false,'never invent a legacy event time');s.close();
 for(const bad of ['2026-02-31T17:30:12.345Z','2026-10-02T17:30:12+00:00','bad\u001b]52;c;canary\u0007','x'.repeat(100000),null,0]){
  state.history[1].at=bad;fs.writeFileSync(file,JSON.stringify(state));before=fs.readFileSync(file);page=await view({...o,view:'history'});
  assert(page.rows[0].includes('Time not recorded'));assert(!page.rows[0].includes('canary'));assert.deepEqual(fs.readFileSync(file),before);
 }
});
