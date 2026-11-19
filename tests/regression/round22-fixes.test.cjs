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

test('REG-214: the manual task form can assign a task to a named person',()=>{
  assert.match(ops,/id="opsManualAssignee"/);
  assert.match(ops,/row\.assigned_user_id=assigneeId; row\.assigned_role=null/);
  assert.match(mig,/assignable_people/);
});
