'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {fixture,textOp}=require('./helpers');const {createCoordinator}=require('../web-server');const {applyOp,hash,indexHtml}=require('../src/web-model');
test('all eleven closed operations, nodes, stale hash, move/remove and pause',async t=>{
 const app=createCoordinator(fixture(t));t.after(()=>app.close());
 const get=()=>{const m=app.model;const f=m.files.find(f=>f.path==='index.html');return {m,f,node:tag=>f.nodes.find(n=>n.selectorHint===tag),css:m.files.find(f=>f.kind==='css')};};
 function edit(make){const {m,f,node,css}=get();const op={expectedRev:m.rev,...make({m,f,node,css})};assert.throws(()=>app.edit({...op,extra:true}),/unknown field/);app.edit(op);}
 edit(()=>textOp(app.model,'$& $1 $$ <Hello>'));
 assert.match(get().f.source,/\$&amp; \$1 \$\$ &lt;Hello&gt;/);
 edit(({f,node})=>({type:'set_attr',fileId:f.id,nodeId:node('img').id,name:'alt',value:'Quote " > $&'}));
 assert.match(get().f.source,/alt="Quote &quot; &gt; \$&amp;"/);
 edit(({f,node})=>({type:'remove_attr',fileId:f.id,nodeId:node('img').id,name:'alt'}));
 edit(({css})=>({type:'css_rule_set',fileId:css.id,selector:'.hero',declarations:'color: red;'}));
 edit(({css})=>({type:'css_rule_remove',fileId:css.id,selector:'.hero'}));
 edit(({f,node})=>({type:'insert_element',fileId:f.id,parentId:node('main').id,position:'first',html:'<aside>Note</aside>'}));
 edit(({f,node})=>({type:'insert_section',fileId:f.id,parentId:node('main').id,position:'last',html:'<section><h2>Next</h2></section>'}));
 edit(({f,node})=>({type:'move_element',fileId:f.id,nodeId:node('aside').id,parentId:node('section').id,position:'last'}));
 edit(({f,node})=>({type:'remove_element',fileId:f.id,nodeId:node('aside').id}));
 edit(()=>({type:'add_page',path:'new/contact.html',title:'Contact & us'}));
 edit(()=>({type:'add_asset',path:'new/shape.svg',content:'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'}));
 assert.equal(app.model.rev,11);assert.equal(app.status.history.length,12);
 assert.throws(()=>app.edit({...textOp(app.model),baseHash:hash('wrong')}),/baseHash/);assert.throws(()=>app.edit({...textOp(app.model),expectedRev:0}),/stale/);
 app.human('pause',{expectedRev:11});assert.throws(()=>app.edit(textOp(app.model)),/paused/);assert.throws(()=>app.checkpoint('blocked',11),/paused/);app.human('resume',{expectedRev:11});app.edit(textOp(app.model));assert.equal(app.model.rev,12);
});
test('quote-aware indexing does not target text inside scripts or comments',()=>{const html='<main><!-- <h1>fake</h1> --><h1 title="a > b">Real</h1><script>const s="<h1>fake</h1>";</script><img alt="a > b"></main>';const nodes=indexHtml(html);assert.equal(nodes.filter(n=>n.selectorHint==='h1').length,1);assert.equal(html.slice(...nodes.find(n=>n.selectorHint==='h1').range),'<h1 title="a > b">Real</h1>');assert.equal(nodes.filter(n=>n.selectorHint==='img').length,1);});
