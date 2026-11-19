const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const sw=fs.readFileSync(path.join(__dirname,'..','..','service-worker.js'),'utf8');

test('REG-210: tapping a push notification opens the app, not the site root',()=>{
  const block=sw.slice(sw.indexOf("addEventListener('notificationclick'"));
  assert.match(block,/new URL\(event\.notification\.data\?\.url \|\| '\.\/', self\.registration\.scope\)/);
  assert.doesNotMatch(block,/self\.location\.origin/);
  assert.match(block,/client\.url\.startsWith\(self\.registration\.scope\)/);
});

test('REG-210: the service worker cache name was bumped so phones pick up the fix',()=>{
  assert.match(sw,/const CACHE_NAME = 'spray-wash-operations-v4-0-112';/);
});

const ops=fs.readFileSync(path.join(__dirname,'..','..','operations-v4.js'),'utf8');
const push=fs.readFileSync(path.join(__dirname,'..','..','supabase','functions','notification-scheduler','push.ts'),'utf8');
const emp=fs.readFileSync(path.join(__dirname,'..','..','supabase','functions','employee-notifications','index.ts'),'utf8');
const mig=fs.readFileSync(path.join(__dirname,'..','..','supabase','migrations','20261119_vehicle_holders_and_reminders.sql'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');

test('REG-211: a tapped push opens the item that produced it, only where the role can open it',()=>{
  assert.match(sw,/postMessage\(\{ type: 'spray-wash-open'/);
  const fn=ops.slice(ops.indexOf('function applyPushOpen'),ops.indexOf('async function loadVehicleHolders'));
  assert.match(fn,/kind==='task'[^\n]*canAccessSharedTasks\(\)/);
  assert.match(fn,/kind==='vehicle-check'[^\n]*canUseVehicleChecks\(\)/);
  assert.doesNotMatch(fn,/scrollTo|scrollIntoView/);
  assert.match(push,/open=task&id=/);
  assert.match(push,/open=vehicle-check&id=/);
  assert.match(emp,/open=task&id=/);
});

test('REG-212: vehicle-check reminders go only to the vehicle holder, from day 14, then daily until a check is done',()=>{
  assert.match(mig,/vehicle_id uuid primary key/);
  assert.match(mig,/user_id uuid not null unique/);
  assert.match(mig,/vehicle_check_due/);
  assert.match(push,/p\.date<addDays\(base,14\)/);
  assert.match(push,/vehicle-check:\$\{v\.id\}:\$\{h\.user_id\}:\$\{p\.date\}/);
  assert.match(push,/ck\.inspection_date>base/);
  assert.match(push,/h\?\.user_id!==n\.recipient_user_id/);
});

test('REG-213: choosing a vehicle already held is refused with the holder named; Admin can reassign freely',()=>{
  assert.match(mig,/This vehicle is already held by %/);
  assert.match(mig,/create or replace function public\.admin_set_vehicle_holder/);
  assert.match(mig,/spray_wash_has_role\(array\['Admin'\]\)/);
  assert.match(ops,/No Vehicle Assigned/);
  assert.match(html,/id="myVehiclePanel"/);
  assert.match(ops,/data-ops-vehicle-holder/);
});

test('REG-214: maintenance tasks always go to the Maintenance manager; the manual task form has no person field',()=>{
  assert.doesNotMatch(ops,/opsManualAssignee/);
  assert.match(ops,/assigned_role: 'Maintenance manager'/);
});

test('REG-215: Vehicle drivers is the last section under Users & Permissions',()=>{
  const users=ops.slice(ops.indexOf('<h3>Users & Permissions</h3>'),ops.indexOf('function bindRenderedEvents'));
  const iDrivers=users.indexOf('admin-vehicle-holders'),iCurrent=users.indexOf('admin-current-users');
  assert.ok(iCurrent>-1&&iDrivers>iCurrent,'Vehicle drivers must come after Current Users');
  assert.ok(users.slice(iDrivers).indexOf('data-ops-keep-open')<0||users.slice(iDrivers+10).indexOf('data-ops-keep-open')<0);
});

test('REG-216: "Hoses & Reels" is a sub-asset type with no oil fields',()=>{
  assert.match(ops,/'Hoses & Reels':'HSR'/);
  assert.match(ops,/<option value="Hoses & Reels"/);
  assert.match(ops,/data-machinery-types="Engine,Gearbox,Pump"/);
  assert.match(ops,/oil_grade:type==='Hoses & Reels'\?null/);
  const mig2=fs.readFileSync(path.join(__dirname,'..','..','supabase','migrations','20261120_machinery_type_hoses_reels.sql'),'utf8');
  assert.match(mig2,/'Hoses & Reels'/);
});

test('REG-217: a task opens by tapping its row (no Open button) and closes by tapping it again',()=>{
  assert.match(ops,/data-ops-open-task-row=/);
  assert.doesNotMatch(ops,/data-ops-open-task="/);
  assert.doesNotMatch(ops,/<th>Actions<\/th><\/tr>\$\{rows\.map\(t=>`<tr class="ops-task-row/);
  assert.match(ops,/state\.openTaskId = String\(state\.openTaskId\)===String\(b\.dataset\.opsOpenTaskRow\) \? ''/);
});

test('REG-218: on phones each task is a stacked card, not a wide table',()=>{
  assert.match(ops,/@media\(max-width:720px\)\{\s*table\.ops-table\.ops-tasks-table\{min-width:0;display:block/);
  assert.match(ops,/td\[data-label\]::before\{content:attr\(data-label\)/);
});

test('REG-219: automatic training tasks are information only with a button to the training record',()=>{
  assert.match(ops,/function trainingTaskAuto\(t\)/);
  assert.match(ops,/trainingTaskAuto\(t\)\?trainingTaskPanelHtml\(t\)/);
  assert.match(ops,/Add training record/);
  assert.match(ops,/Update training record/);
  assert.match(ops,/if\(trainingTaskAuto\(task\)\) return alert\('Training tasks close by themselves/);
  const panel=ops.slice(ops.indexOf('function trainingTaskPanelHtml'),ops.indexOf('async function goToTrainingForTask'));
  assert.doesNotMatch(panel,/opsTaskStatus|Save task update/);
  assert.match(ops,/canUseTraining\(\)\?`<button[^`]*data-ops-training-task/);
});

test('REG-220: Hoses & Reels records unloader make/model, swivel make/model and swivel seal kit part number',()=>{
  const m=fs.readFileSync(path.join(__dirname,'..','..','supabase','migrations','20261120b_hoses_reels_fields.sql'),'utf8');
  for(const c of ['unloader_make_model','swivel_make_model','swivel_seal_kit_part_number']){ assert.match(m,new RegExp(c)); assert.match(ops,new RegExp(c)); }
  assert.match(ops,/data-machinery-types="Hoses & Reels"/);
  assert.match(ops,/if\(type==='Hoses & Reels'\) Object\.assign\(row,/);
});
