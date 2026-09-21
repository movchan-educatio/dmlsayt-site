const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const window = { SiteRender: { esc: s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) } };
const context = { window, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'admin', 'visual-editor.js'), 'utf8'), context);
const editor = window.VisualPageEditor;

function semantic(s) {
  return String(s).replace(/\r\n?/g, '\n').trim().replace(/\n{3,}/g, '\n\n').replace(/\n[ \t]+(?=<)/g, '\n');
}

const dir = path.join(root, 'content', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
const failed = [];
const types = new Set();
for (const file of files) {
  const original = fs.readFileSync(path.join(dir, file), 'utf8');
  const blocks = editor.parse(original);
  blocks.forEach(b => types.add(b.type));
  const result = editor.serialize(blocks);
  if (semantic(original) !== semantic(result)) failed.push(file);
}
if (failed.length) {
  console.error('ROUND-TRIP FAILED:', failed.join(', '));
  process.exit(1);
}
console.log(`ROUND-TRIP PASSED: ${files.length} pages; block types: ${[...types].sort().join(', ')}`);
