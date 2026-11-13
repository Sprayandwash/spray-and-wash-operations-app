const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const sql=read('supabase/migrations/20261113_purge_removes_training_person.sql');
const fn=read('supabase/functions/account-admin/index.ts');
const ops=read('operations-v4.js');
test('REG-203: purging a test account removes its Training person, records and certificate files',()=>{
  assert.match(sql,/delete from public\.operations_training_people where user_id = target;/);
  assert.doesNotMatch(sql,/update public\.operations_training_people set user_id = null where user_id = target;/);
  assert.match(sql,/'training_people', c_tpeople, 'training_records', c_trecords, 'training_files', c_tfiles/);
  assert.match(sql,/'evidence_paths', v_paths/);
  assert.match(fn,/service\.storage\.from\('training-evidence'\)\.remove\(evidencePaths\)/);
  assert.match(fn,/delete counts\.evidence_paths/);
  assert.match(ops,/Training person: \$\{c\.training_people\|\|0\}/);
  // certificates stay protected
  assert.match(sql,/Certificates are compliance records and are never purged/);
});
test('REG-204: blocking archives the Training person and unblocking reinstates them',()=>{
  assert.match(fn,/action==='block'[^\n]*update\(\{active:false\}\)\.eq\('user_id',target\)/);
  assert.match(fn,/action==='unblock'[^\n]*update\(\{active:true\}\)\.eq\('user_id',target\)/);
});
