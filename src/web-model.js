'use strict';
const RX=require('./patterns');

const crypto = require('crypto');
const path = require('path');
const safe = require('./sanitize');
const {cssRules,balancedCss}=require('./css-rules');
const {mapping:caseFold}=require('./case-fold.json');
function collisionKey(value){return Array.from(value.normalize('NFC'),c=>caseFold[c]??c).join('').normalize('NFC');}

const OP_FIELDS = {
  set_text: ['type', 'expectedRev', 'fileId', 'nodeId', 'baseHash', 'text'],
  set_attr: ['type', 'expectedRev', 'fileId', 'nodeId', 'name', 'value'],
  remove_attr: ['type', 'expectedRev', 'fileId', 'nodeId', 'name'],
  css_rule_set: ['type', 'expectedRev', 'fileId', 'selector', 'declarations'],
  css_rule_remove: ['type', 'expectedRev', 'fileId', 'selector'],
  insert_element: ['type', 'expectedRev', 'fileId', 'parentId', 'position', 'html'],
  insert_section: ['type', 'expectedRev', 'fileId', 'parentId', 'position', 'html'],
  remove_element: ['type', 'expectedRev', 'fileId', 'nodeId'],
  move_element: ['type', 'expectedRev', 'fileId', 'nodeId', 'parentId', 'position'],
  add_page: ['type', 'expectedRev', 'path', 'title'],
  add_asset: ['type', 'expectedRev', 'path', 'content'],

};

function hash(source) { return `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`; }
function safePath(value) { return typeof value === 'string' && value.length > 0 && value.length <= 240 && !RX.hiddenPath.test(value) && !RX.illegalPath.test(value) && value.split('/').every(p => p && Buffer.byteLength(p,'utf8')<=255 && p !== '.' && p !== '..' && (!p.startsWith('.') || ['.well-known','.nojekyll'].includes(p)) && !RX.pathTail.test(p) && !RX.devicePath.test(p)); }
function indexHtml(source) {
  const nodes=[],stack=[],byTag=new Map(),selected=new Set();let serial=0;
  for(const t of safe.tokenize(source)){
    if(!t.tag)continue;
    if(!t.closing){
      const node={id:`n_${serial++}`,selectorHint:t.tag,range:[t.start,t.end],openEnd:t.end,closeStart:t.end,paired:false};nodes.push(node);
      if(safe.VOID.has(t.tag)||t.self)selected.add(node);
      else {if(!byTag.has(t.tag))byTag.set(t.tag,[]);byTag.get(t.tag).push(stack.length);stack.push(node);}
    }else{
      const positions=byTag.get(t.tag);if(!positions?.length)continue;
      const at=positions.at(-1),node=stack[at];
      // Each opening is removed once, including opens implicitly closed by an ancestor.
      while(stack.length>at){const removed=stack.pop();byTag.get(removed.selectorHint).pop();}
      node.range[1]=t.end;node.closeStart=t.start;node.paired=true;selected.add(node);
    }
  }
  return nodes.filter(node=>selected.has(node));
}
function validateModel(model) {
  if (!model || !Number.isInteger(model.rev) || model.rev < 0 || !safePath(model.root) || !Array.isArray(model.files)) throw new Error('invalid model envelope');
  const directoryNames = new Map();
  const directories = new Set(model.directories || []);
  for (const file of model.files) { const parts = file.path.split('/'); parts.pop(); while(parts.length) { directories.add(parts.join('/')); parts.pop(); } }
  for (const dir of directories) { if (!safePath(dir)) throw new Error('invalid directory'); const key=collisionKey(dir); if(directoryNames.has(key) && directoryNames.get(key)!==dir) throw new Error('directory case collision'); directoryNames.set(key,dir); }
  const ids = new Set(); const paths = new Set();
  for (const file of model.files) {
    if (!file || typeof file.id !== 'string' || ids.has(file.id) || !safePath(file.path) || (paths.has(collisionKey(file.path)) || directoryNames.has(collisionKey(file.path))) || !['html', 'css', 'text', 'asset'].includes(file.kind) || typeof file.source !== 'string' || !Array.isArray(file.nodes)) throw new Error('invalid file');
    ids.add(file.id); paths.add(collisionKey(file.path)); const nodeIds = new Set();
    for (const node of file.nodes) { if (!node || typeof node.id !== 'string' || nodeIds.has(node.id) || typeof node.selectorHint !== 'string' || !Array.isArray(node.range) || node.range.length !== 2 || !node.range.every(Number.isInteger) || node.range[0] < 0 || node.range[1] > file.source.length || node.range[0] >= node.range[1]) throw new Error('invalid node'); nodeIds.add(node.id); }
  }
  return model;
}
function validateOp(model, op) {
  if (!op || typeof op.type !== 'string' || !Object.hasOwn(OP_FIELDS,op.type)) throw new Error(`unknown operation: ${op?.type || '<missing>'}`);
  const allowed = OP_FIELDS[op.type];
  for (const key of Object.keys(op)) if (!allowed.includes(key)) throw new Error(`${op.type}: unknown field: ${key}`);
  for (const key of allowed) if (!(key in op)) throw new Error(`${op.type}: missing field: ${key}`);
  if (!Number.isInteger(op.expectedRev) || op.expectedRev !== model.rev) throw new Error('stale revision');
  if (op.type === 'add_page' || op.type === 'add_asset') return {};
  const file = model.files.find((item) => item.id === op.fileId); if (!file) throw new Error(`${op.type}: file not found`);
  const nodeKey = allowed.includes('nodeId') ? 'nodeId' : allowed.includes('parentId') ? 'parentId' : null;
  const node = nodeKey && file.nodes.find((item) => item.id === op[nodeKey]); if (nodeKey && !node) throw new Error(`${op.type}: ${nodeKey === 'parentId' ? 'parent' : 'node'} not found`);
  return { file, node };
}
function applyOp(model, op, policy = {}) {
  const next = structuredClone(model); const { file, node } = validateOp(next, op);
  if (node && !(op.type === 'set_text' && node.selectorHint === 'title') && !safe.HTML.has(node.selectorHint) && !['main','body','html'].includes(node.selectorHint)) throw new Error('unsafe target element');
  if (op.type === 'add_page') addPage(next, op);
  else if (op.type === 'add_asset') addAsset(next, op, policy);
  else if (op.type === 'set_text') { requireHtml(file); if (hash(file.source.slice(...node.range)) !== op.baseHash) throw new Error('set_text: baseHash mismatch'); replaceNode(file, node, setText(file.source.slice(...node.range), op.text)); }
  else if (op.type === 'set_attr') { requireHtml(file); replaceNode(file, node, setAttribute(file.source.slice(...node.range), op.name, op.value, policy)); }
  else if (op.type === 'remove_attr') { requireHtml(file); replaceNode(file, node, removeAttribute(file.source.slice(...node.range), op.name)); }
  else if (op.type === 'css_rule_set') setCssRule(file, op.selector, op.declarations, policy);
  else if (op.type === 'css_rule_remove') removeCssRule(file, op.selector);
  else if (op.type === 'insert_element' || op.type === 'insert_section') insertElement(file, node, op.position, op.html, op.type === 'insert_section', policy);
  else if (op.type === 'remove_element') { requireHtml(file); replaceNode(file, node, ''); }
  else if (op.type === 'move_element') moveElement(file, node, op, policy);

  const changed=file||next.files.at(-1);
  changed.nodes=changed.kind==='html'?indexHtml(changed.source):[];
  next.rev++; return validateModel(next);
}
function requireHtml(file) { if (file.kind !== 'html') throw new Error('operation requires an HTML file'); }
function replaceNode(file, node, replacement) { file.source = file.source.slice(0, node.range[0]) + replacement + file.source.slice(node.range[1]); }
function setText(fragment, text) { if (typeof text !== 'string' || text.length > 65536) throw new Error('invalid text'); const tokens = safe.tokenize(fragment); const open = tokens[0], close = tokens.at(-1); if (!close.closing || close.tag !== open.tag) throw new Error('node is not paired'); return fragment.slice(0,open.end) + safe.escapeText(text) + fragment.slice(close.start); }
function escapeHtml(value) { return safe.escapeText(value); }
function validName(name) { return typeof name === 'string' && RX.attributeName.test(name); }
function setAttribute(fragment, name, value, policy) {
  const [k,v] = safe.attribute(name,value,policy); const tag = safe.tokenize(fragment)[0];
  const attrs = safe.parseAttrs(tag.attrs).filter(([n])=>n !== k.toLowerCase()); attrs.push([k,v]);
  const opening = '<'+tag.tag+attrs.map(([a,b])=>' '+a+'="'+safe.escapeAttr(b)+'"').join('')+'>';
  return opening + fragment.slice(tag.end);
}
function removeAttribute(fragment,name){
 if(!validName(name))throw Error('remove_attr: invalid attribute name');const tag=safe.tokenize(fragment)[0],attrs=safe.parseAttrs(tag.attrs),key=name.toLowerCase();
 if(!attrs.some(([k])=>k===key))throw Error('remove_attr: attribute not found');
 return '<'+tag.tag+attrs.filter(([k])=>k!==key).map(([k,v])=>' '+k+'="'+safe.escapeAttr(v)+'"').join('')+'>'+fragment.slice(tag.end);
}
function validSelector(selector) { return typeof selector === 'string' && selector.trim() === selector && selector.length > 0 && selector.length <= 256 && RX.selector.test(selector) && balancedCss(selector); }
function validDeclarations(value) { return typeof value === 'string' && value.trim().length > 0 && !RX.braces.test(value); }
function setCssRule(file, selector, declarations, policy) {
  declarations=safe.css(declarations,policy.allowExternal);
  if(file.kind!=='css'||!validSelector(selector)||!validDeclarations(declarations))throw Error('css_rule_set: invalid stylesheet rule');
  const rule=`${selector} { ${declarations} }`;
  for(const range of cssRules(file.source))if(range.selector===selector){file.source=file.source.slice(0,range.start)+rule+file.source.slice(range.end);return;}
  file.source=file.source.trimEnd()+'\n'+rule+'\n';
}
function removeCssRule(file, selector) {
  if(file.kind!=='css'||!validSelector(selector))throw Error('css_rule_remove: invalid stylesheet selector');
  for(const range of cssRules(file.source))if(range.selector===selector){file.source=(file.source.slice(0,range.start)+file.source.slice(range.end)).trimStart();return;}
  throw Error('css_rule_remove: rule not found');
}
function insertionPoint(file, parent, position) { if (!['first', 'last', 'before', 'after'].includes(position)) throw new Error('invalid position'); if (position === 'before') return parent.range[0]; if (position === 'after') return parent.range[1]; const fragment = file.source.slice(...parent.range); const tags = safe.tokenize(fragment); const openEnd = tags[0].end - 1; const closeStart = tags.at(-1).closing ? tags.at(-1).start : -1; if (openEnd < 0 || closeStart < 0) throw new Error('parent is not paired'); return parent.range[0] + (position === 'first' ? openEnd + 1 : closeStart); }
function insertElement(file, parent, position, html, sectionOnly, policy) { requireHtml(file); html = safe.fragment(html, {section:sectionOnly,...policy}); const at = insertionPoint(file, parent, position); file.source = file.source.slice(0, at) + html + file.source.slice(at); }
function moveElement(file, node, op, policy) { requireHtml(file); const parent = file.nodes.find((item) => item.id === op.parentId); if (!parent || (!safe.HTML.has(parent.selectorHint) && parent.selectorHint !== 'body') || parent.id === node.id || (parent.range[0] >= node.range[0] && parent.range[1] <= node.range[1])) throw new Error('move_element: invalid parent'); const fragment = safe.fragment(file.source.slice(...node.range), policy); const without = file.source.slice(0, node.range[0]) + file.source.slice(node.range[1]); const adjusted = { ...parent, range: parent.range.map((n) => n > node.range[0] ? n - (node.range[1] - node.range[0]) : n) }; const holder = { source: without }; const at = insertionPoint(holder, adjusted, op.position); file.source = without.slice(0, at) + fragment + without.slice(at); }
function addPage(model, op) { if (!safePath(op.path) || path.extname(op.path).toLowerCase() !== '.html' || typeof op.title !== 'string' || !op.title.trim() || model.files.some((file) => collisionKey(file.path) === collisionKey(op.path))) throw new Error('add_page: invalid or duplicate HTML path'); const source = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(op.title)}</title></head><body><main></main></body></html>\n`; model.files.push({ id: uniqueId(model, op.path), path: op.path, kind: 'html', baseHash: null, source, nodes: [] }); }
function addAsset(model, op, policy) { if (!safePath(op.path) || !op.path.endsWith('.svg') || model.files.some(f=>collisionKey(f.path)===collisionKey(op.path))) throw new Error('invalid or duplicate SVG path'); const source = safe.fragment(op.content,{svg:true,...policy}); model.files.push({id:uniqueId(model,op.path),path:op.path,kind:'asset',source,nodes:[]}); }
function uniqueId(model, value) { const stem = `f_${value.replace(RX.nonWord, '_')}`; let id = stem; let i = 1; while (model.files.some((file) => file.id === id)) id = `${stem}_${i++}`; return id; }
module.exports = { safePath, applyOp, hash, indexHtml, validateModel, validateOp };
