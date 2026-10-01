'use strict';
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description) => ({ type: 'string', description });
const integer = (description, minimum = 0) => ({ type: 'integer', minimum, description });
const TOOLS = [
  { name: 'web_pages', description: 'List the working-copy revision, managed files, and addressable nodes. Call this before editing; never guess file_id or node_id.', inputSchema: schema({}) },
  { name: 'web_read', description: 'Read page source from the working copy, either whole or by zero-based character range.', inputSchema: schema({ file_id: str('File id from web_pages.'), start: integer('Inclusive character offset.'), end: integer('Exclusive character offset.') }, ['file_id']) },
  { name: 'web_find', description: 'Search text across all files in the current working copy (case-insensitive).', inputSchema: schema({ query: str('Non-empty text to find.'), limit: integer('Maximum matches; default 40.', 1) }, ['query']) },
  { name: 'web_css', description: 'Read CSS rules whose selector contains the requested text, from the current working copy.', inputSchema: schema({ selector: str('Selector text, for example .hero.'), file_id: str('Optional CSS file id.') }, ['selector']) },
  { name: 'web_set_text', description: 'Set the text of one paired HTML node. Pass expected_rev from your last read.', inputSchema: schema({ file_id: str('HTML file id.'), node_id: str('Node id.'), text: str('New plain text (escaped by Site Studio).') }, ['file_id', 'node_id', 'text']) },
  { name: 'web_set_attr', description: 'Set one HTML attribute in the working copy.', inputSchema: schema({ file_id: str('HTML file id.'), node_id: str('Node id.'), name: str('Attribute name.'), value: str('Attribute value.') }, ['file_id', 'node_id', 'name', 'value']) },
  { name: 'web_css_set', description: 'Set one stylesheet rule in a CSS file. declarations is the rule body, for example "color: red; margin: 0".', inputSchema: schema({ file_id: str('CSS file id.'), selector: str('Full selector text.'), declarations: str('Declaration list without braces.') }, ['file_id', 'selector', 'declarations']) },
  { name: 'web_insert_section', description: 'Insert a <section> fragment relative to a parent node.', inputSchema: schema({ file_id: str('HTML file id.'), parent_id: str('Parent node id.'), position: str('One of first, last, before, after.'), html: str('A complete <section>...</section> fragment.') }, ['file_id', 'parent_id', 'position', 'html']) },
  { name: 'web_remove', description: 'Remove one node from the working copy.', inputSchema: schema({ file_id: str('HTML file id.'), node_id: str('Node id.') }, ['file_id', 'node_id']) },
  { name: 'web_move', description: 'Move a node relative to another node in the same file.', inputSchema: schema({ file_id: str('HTML file id.'), node_id: str('Node to move.'), parent_id: str('Destination node id.'), position: str('One of first, last, before, after.') }, ['file_id', 'node_id', 'parent_id', 'position']) },
  { name: 'web_add_page', description: 'Add a new HTML page to the working copy from a minimal valid document.', inputSchema: schema({ path: str('Safe relative .html path.'), title: str('Page title.') }, ['path', 'title']) },
  { name: 'web_draw', description: 'Author a pure SVG asset file. Rejects scripts, foreignObject and event attributes. External references are refused unless started with --allow-external. Reference it afterwards with web_insert_section or web_set_attr.', inputSchema: schema({ path: str('Safe relative .svg asset path.'), svg: str('Complete pure SVG source.') }, ['path', 'svg']) },
  { name: 'web_screenshot_note', description: 'Return the working-copy revision and file count. No screenshot is captured or inspected; use a separate visual tool for screenshots.', inputSchema: schema({}) },
  { name: 'web_timeline', description: 'Read the working-copy timeline. Undo, redo and restore require the dashboard session.', inputSchema: schema({ limit: integer('Most recent entries; default 50.', 1) }) },
];

const mutations = new Set(['web_set_text','web_set_attr','web_css_set','web_insert_section','web_remove','web_move','web_add_page','web_draw']);
for (const tool of TOOLS) {
  if (mutations.has(tool.name)) {
    tool.inputSchema.properties.expected_rev = integer('Revision returned by your most recent read. Stale revisions refuse; read again.');
    tool.inputSchema.required.push('expected_rev');
  }
  for (const field of Object.values(tool.inputSchema.properties)) if (field.type === 'string') field.maxLength = 65536;
}
Object.assign(TOOLS.find(t=>t.name==='web_pages').inputSchema.properties, {offset:integer('File offset, default 0.'),limit:{type:'integer',minimum:1,maximum:20,description:'Files per page, default 20.'},file_id:str('Optional file id to list its nodes.'),node_offset:integer('Node offset, default 0.')});
TOOLS.find(t=>t.name==='web_pages').description = 'List revision and files with up to 20 nodes each. Use file_id and node_offset for remaining nodes; offsets are revision-specific.';
TOOLS.find(t=>t.name==='web_read').description = 'Read up to 16,384 characters of a managed HTML/CSS/text file, with revision and next offset. Opaque assets cannot be read.';
TOOLS.find(t=>t.name==='web_find').inputSchema.properties.limit.maximum=100;
TOOLS.find(t=>t.name==='web_timeline').inputSchema.properties.limit.maximum=100;
TOOLS.find(t=>t.name==='web_insert_section').inputSchema.properties.position.enum=['first','last','before','after'];
TOOLS.find(t=>t.name==='web_move').inputSchema.properties.position.enum=['first','last','before','after'];
TOOLS.push({name:'web_checkpoint',description:'Save a named checkpoint of the current working copy. Restore and delete are not available as MCP tools and require the dashboard session.',inputSchema:schema({label:{type:'string',minLength:1,maxLength:80},expected_rev:integer('Current revision.')},['label','expected_rev'])});
TOOLS.push({name:'web_preview',description:'Return the loopback live-preview URL and current revision. The human dashboard controls pause, undo, restore and confirmed export. No screenshot is captured.',inputSchema:schema({})});
// Even six-byte JSON escapes across every string field fit in one frame.
for(const tool of TOOLS)for(const p of Object.values(tool.inputSchema.properties))if(p.type==='string')p.maxLength=Math.min(p.maxLength??8192,8192);
module.exports={TOOLS,mutations};
