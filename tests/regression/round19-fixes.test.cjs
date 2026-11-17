const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const ops=fs.readFileSync(path.join(__dirname,'..','..','operations-v4.js'),'utf8');
test('REG-205: long names wrap in every list table instead of stretching the columns',()=>{
  const m=ops.match(/\.ops-table th,\.ops-table td,[^{]*\{ overflow-wrap:anywhere; \}/);
  assert.ok(m,'wrapping rule present');
  for(const c of ['sw417-table','sw419-table','sw421-table','sw422-rowlist','sw422-scroll','sw424-table'])assert.ok(m[0].includes(c),c+' covered');
});
test('REG-206: tall lists scroll inside their own box so the horizontal scroll bar is always on screen',()=>{
  assert.match(ops,/\.ops-table-wrap:not\(\.ops-matrix-wrap\) \{ max-height:75vh; overflow:auto; \}/);
  assert.match(ops,/\.ops-table-wrap:has\(\.ops-task-detail-row\) \{ max-height:none; \}/);
  assert.match(ops,/\.ops-table-wrap:not\(\.ops-matrix-wrap\) \.ops-table th \{ position:sticky; top:0; z-index:1; \}/);
});
