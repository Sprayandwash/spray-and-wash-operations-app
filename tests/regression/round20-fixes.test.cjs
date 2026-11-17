const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const ops=fs.readFileSync(path.join(__dirname,'..','..','operations-v4.js'),'utf8');
const idx=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
test('REG-207: list tables no longer break words anywhere; only cells with a very long unbroken string may',()=>{
  assert.doesNotMatch(ops,/\.ops-table-fixed th,\.ops-table-fixed td\{overflow-wrap:anywhere\}/);
  assert.match(ops,/\.ops-wrap-any\{overflow-wrap:anywhere !important;\}/);
  assert.match(ops,/const LONG=\/\\S\{25,\}\/;/);
  assert.match(ops,/\.ops-pill,\.ops-role-chip,\.ops-toggle-on,\.ops-toggle-off\{white-space:nowrap;\}/);
  assert.match(ops,/<col style="width:125px"><col style="width:105px"><col>/);
});
test('REG-208: a long photo or file name stays inside its box',()=>{
  assert.match(idx,/\.photoCard\{[^}]*overflow:hidden;overflow-wrap:anywhere\}/);
  assert.match(idx,/minmax\(min\(140px,100%\),1fr\)/);
  assert.match(ops,/\.ops-asset-files-view div,\.ops-asset-files div\{overflow-wrap:anywhere;min-width:0\}/);
});
test('REG-207: the Download evidence person list is wide enough that a long surname stays whole',()=>{
  assert.match(ops,/\.ops-evidence-pop \{[^}]*width:420px/);
  assert.match(ops,/\.ops-evidence-person \.ops-subtle \{[^}]*max-width:30%/);
});
