const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const window = { SiteRender: {
  esc: s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  youtubeId: s => (String(s).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) || [])[1] || null,
  driveId: s => (String(s).match(/\/d\/([A-Za-z0-9_-]+)/) || String(s).match(/[?&]id=([A-Za-z0-9_-]+)/) || [])[1] || null
} };
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

const image = { src: 'uploads/test photo.jpg', alt: 'Фото школи', caption: 'Підпис', width: '67', align: 'right', fit: 'cover' };
const imageRaw = editor.imageRaw(image);
const restoredImage = editor.imageData(imageRaw);
if (restoredImage.width !== '67' || restoredImage.align !== 'right' || restoredImage.fit !== 'cover' || restoredImage.caption !== 'Підпис') {
  console.error('IMAGE SETTINGS ROUND-TRIP FAILED'); process.exit(1);
}

const smartCases = [
  ['https://youtu.be/dQw4w9WgXcQ', 'video'],
  ['https://docs.google.com/document/d/testDoc123/edit', 'google'],
  ['https://docs.google.com/spreadsheets/d/testSheet123/edit', 'google'],
  ['https://docs.google.com/presentation/d/testSlides123/edit', 'google'],
  ['https://drive.google.com/file/d/testDrive123/view', 'google'],
  ['https://example.org/page', 'link']
];
for (const [url, type] of smartCases) {
  const data = editor.smartUrlData(url);
  if (!data || data.type !== type) { console.error(`SMART URL FAILED: ${url}`); process.exit(1); }
}
if (editor.smartUrlData('javascript:alert(1)') !== null || editor.smartUrlData('not a url') !== null) {
  console.error('UNSAFE URL REJECTION FAILED'); process.exit(1);
}
for (const ext of ['pdf', 'docx', 'xlsx', 'pptx']) {
  const blocks = editor.parse(`[Файл ${ext}](uploads/test.${ext})`);
  if (blocks.length !== 1 || blocks[0].type !== 'document') { console.error(`DOCUMENT TYPE FAILED: ${ext}`); process.exit(1); }
}
const privateDrive = editor.smartUrlData('https://drive.google.com/drive/folders/privateFolder');
if (!privateDrive || privateDrive.type !== 'google' || privateDrive.preview !== '' || !/Документ Google Drive/.test(editor.smartRaw(privateDrive))) {
  console.error('GOOGLE FALLBACK FAILED'); process.exit(1);
}
console.log('SMART CONTENT PASSED: image settings, PDF/DOCX/XLSX/PPTX, YouTube, Google Docs/Sheets/Slides/Drive, fallback, link and invalid URL');
