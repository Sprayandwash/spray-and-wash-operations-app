const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const ops=read('operations-v4.js');
test('REG-196: opening a task keeps the page where it is and shows a bordered box',()=>{
  assert.match(ops,/const keepY=window\.scrollY; render\(\); window\.scrollTo\(\{top:keepY,left:0,behavior:'auto'\}\);/);
  assert.doesNotMatch(ops,/data-ops-open-task[^\n]*opsScrollBelowHeader/);
  assert.match(ops,/\.ops-task-detail-row>td\{[^}]*border:2px solid #1f5f9f/);
});
test('REG-197: the Notifications card has no subtitle line',()=>{
  const p=read('push-notifications.js');
  assert.doesNotMatch(p,/emergency kill switch/);
  assert.match(p,/<h3>Notifications<\/h3><\/div>/);
});
