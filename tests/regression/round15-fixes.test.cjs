const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const app=read('app.js'),ops=read('operations-v4.js');
test('REG-199: starting an inspection for one item shows that item, not the generic picker',()=>{
  assert.match(app,/window\.__inspectionTargetId=String\(id\);window\.__inspectionTargetFresh=true;showTab\("inspect"\)/);
  assert.match(app,/function clearInspectionForm\(\)\{window\.__inspectionTargetId="";window\.applyInspectionTargetV419\?\.\(\);/);
  assert.match(ops,/function applyInspectionTarget\(\)/);
  assert.match(ops,/Inspecting \$\{esc\(\$\('inSerial'\)\?\.value\|\|''\)\}/);
  assert.match(ops,/Choose a different item/);
  assert.match(ops,/window\.__inspectionTargetId = '';\n\s+if\(originalShowTab\) originalShowTab\('inspect'\)/);
  assert.match(ops,/if\(window\.__inspectionTargetFresh\) window\.__inspectionTargetFresh = false; else window\.__inspectionTargetId = ''/);
});
