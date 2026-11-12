const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const ops=read('operations-v4.js');
test('REG-196: opening a task scrolls the whole task line and its form to the top',()=>{
  assert.match(ops,/if\(state\.openTaskId\)\{ const d=document\.querySelector\('tr\.ops-task-row-open'\)\|\|byId\('opsTaskDetailCard'\); if\(d\) opsScrollBelowHeader\(d\); \}/);
});
test('REG-197: the Notifications card has no subtitle line',()=>{
  const p=read('push-notifications.js');
  assert.doesNotMatch(p,/emergency kill switch/);
  assert.match(p,/<h3>Notifications<\/h3><\/div>/);
});
