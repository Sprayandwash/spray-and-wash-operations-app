const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const ops=read('operations-v4.js');
test('REG-201: any table that opens a detail row inside it keeps fixed column widths',()=>{
  // every <table ...> whose markup is followed (before the table closes) by an in-table detail row must be fixed-layout with a colgroup
  const parts=ops.split('<table');
  let found=0;
  for(const part of parts.slice(1)){
    const body=part.split('</table>')[0];
    if(/ops-task-detail-row/.test(body)){
      found++;
      assert.match(body.slice(0,200),/class="ops-table ops-table-fixed"><colgroup>/,'table with an in-table detail row must use ops-table-fixed and a colgroup');
    }
  }
  assert.ok(found>=2,'expected the Tasks table and the Maintenance Items table');
  assert.match(ops,/table\.ops-table\.ops-table-fixed\s*\{\s*table-layout:fixed;/);
});
test('REG-202: Cancel in Edit user returns to the user list, not a collapsed Users and Permissions tab',()=>{
  assert.match(ops,/<details data-ops-keep-open="admin-current-users" \$\{state\.editingActualUserId\|\|editingPreload\?'open':opsKeepOpen\('admin-current-users'\)\}>/);
  assert.match(ops,/data-ops-cancel-user-edit\]'\)\.forEach\(b => b\.addEventListener\('click', \(\) => \{ state\.editingActualUserId=''; render\(\); \}\)\)/);
});
