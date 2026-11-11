const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const sql=read('supabase/migrations/20261111_auto_close_training_tasks.sql');

test('REG-195: training tasks close automatically when the person is no longer due',()=>{
  assert.match(sql,/create or replace function public\.operations_close_stale_training_tasks_v4078\(\)/);
  for(const reason of ['a newer training record has been added','the training record is now current','a training record has been added','the course is no longer compulsory for this person','the person is no longer active','the course is no longer active'])
    assert.ok(sql.includes(reason),reason);
  assert.match(sql,/status = 'Completed'/);
  assert.match(sql,/Closed automatically: /);
  assert.doesNotMatch(sql,/\bdelete from public\.operations_maintenance_tasks/i);
});

test('REG-195: closing is triggered by record, requirement, person and course changes and cannot be called by app users',()=>{
  for(const tbl of ['operations_training_records','operations_training_matrix','operations_training_people','operations_training_courses'])
    assert.match(sql,new RegExp(`on public\\.${tbl}\\n?\\s*(after|for)`));
  assert.match(sql,/revoke all on function public\.operations_close_stale_training_tasks_v4078\(\) from public, anon, authenticated/);
  assert.match(sql,/security definer\s+set search_path = public/);
});

test('REG-195: only open-type statuses and only the two automatic training keys are touched',()=>{
  assert.match(sql,/t\.status in \('Open', 'In Progress', 'Waiting on Parts', 'Waiting on Someone'\)/);
  assert.match(sql,/training_record_expiry:%/);
  assert.match(sql,/training_matrix_missing:%/);
});
