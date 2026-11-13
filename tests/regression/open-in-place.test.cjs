const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const files=['app.js','operations-v4.js','push-notifications.js'];
// Approved scroll uses. Anything else that scrolls is treated as scroll-on-open and fails.
const approved=[
  /top:\s*(scrollY|keepY|y|eqOpenScrollY|y\|\|window\.scrollY)\b/,   // put the page back where it was
  /scrollTo\(x,\s*y\)/,                                               // put the page back where it was
  /top:\s*0/,                                                         // a new screen starts at the top
  /scrollTo\(\{top,left:0,behavior:"smooth"\}\)/,                     // tab change starts at the top
  /scrollIntoView\(\{block:'center'\}\)/,                             // flag an invalid field
  /querySelector\(selector\)\?\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/, // Home tile list
  /byId\('opsInspectionForm'\)\?\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/, // Start vehicle check: the form is a separate part of the page, not an item that expands
];
test('REG-198: nothing scrolls when an item opens (every scroll call is on the approved list)',()=>{
  const bad=[];
  for(const f of files){
    read(f).split('\n').forEach((line,i)=>{
      if(!/scrollTo\(|scrollIntoView\(|opsScrollBelowHeader/.test(line)) return;
      if(/^\s*(\/\/|\/\*)/.test(line)) return;
      if(!approved.some(re=>re.test(line))) bad.push(`${f}:${i+1}: ${line.trim().slice(0,140)}`);
    });
  }
  assert.deepEqual(bad,[],'These lines scroll the page; items must open in place (see CLAUDE.md)');
  assert.doesNotMatch(read('operations-v4.js'),/opsScrollBelowHeader/);
});
test('REG-200: editors open inside the item being edited',()=>{
  const ops=read('operations-v4.js');
  assert.match(ops,/editingThisVehicle \? assetEditorHtml\(true\)/);
  assert.match(ops,/class="ops-machinery-card ops-editing-inline">\$\{assetEditorHtml\(true\)\}/);
  assert.match(ops,/addMachineryHereHtml\(vehicle, side\)/);
  assert.match(ops,/const topEditor = editorOpen && !assetEditorInlineRendered \? assetEditorHtml\(\) : ''/);
  assert.match(ops,/<tr class="ops-task-detail-row"><td colspan="3">\$\{maintenanceItemEditorHtml\(selected\)\}<\/td><\/tr>/);
  assert.match(ops,/data-ops-editing-card/);
});
