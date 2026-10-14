'use strict';
// The reviewed MCP tool annotations, in a file of their own (moved unchanged from test/lifecycle.test.js).
const test=require('node:test');const assert=require('node:assert/strict');const {fixture}=require('./helpers');const {start}=require('./mcp-helper');
// Reviewed MCP tool annotations. Seven tools only read the working copy. The nine that change it or its checkpoints
// are destructive (an edit can overwrite or remove content and clears redo; any change can drop the oldest undo states or
// timeline entries) and idempotent (an identical repeat is refused: edits need the current expected_rev and move it on,
// checkpoint labels must be unique). Nothing reaches beyond this computer. Changing a value here must be deliberate.
const READS={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const CHANGES={readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false};
const REVIEWED_ANNOTATIONS={
  web_pages:{title:'List pages and nodes',...READS}, web_read:{title:'Read file source',...READS},
  web_find:{title:'Find text',...READS}, web_css:{title:'Read CSS rules',...READS},
  web_set_text:{title:'Set node text',...CHANGES}, web_set_attr:{title:'Set node attribute',...CHANGES},
  web_css_set:{title:'Set CSS rule',...CHANGES}, web_insert_section:{title:'Insert section',...CHANGES},
  web_remove:{title:'Remove node',...CHANGES}, web_move:{title:'Move node',...CHANGES},
  web_add_page:{title:'Add page',...CHANGES}, web_draw:{title:'Draw SVG asset',...CHANGES},
  web_screenshot_note:{title:'Revision and file count',...READS}, web_timeline:{title:'Read timeline',...READS},
  web_checkpoint:{title:'Save checkpoint',...CHANGES}, web_preview:{title:'Get preview links',...READS},
};
test('every tool the stdio server lists declares its reviewed MCP annotations',async t=>{
  const child=start(fixture(t));t.after(()=>child.stop());await child.init();
  const tools=(await child.rpc('tools/list')).result.tools;
  assert.equal(tools.length,Object.keys(REVIEWED_ANNOTATIONS).length);
  for(const tool of tools){
    const a=tool.annotations;
    assert.equal(typeof a?.title,'string',tool.name+' lacks a title');assert(a.title.trim(),tool.name+' has an empty title');
    assert.equal(typeof a.readOnlyHint,'boolean',tool.name+' lacks readOnlyHint');
    assert.equal(typeof a.destructiveHint,'boolean',tool.name+' lacks destructiveHint');
  }
  assert.deepEqual(Object.fromEntries(tools.map(tool=>[tool.name,tool.annotations])),REVIEWED_ANNOTATIONS);
});
