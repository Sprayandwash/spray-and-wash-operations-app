const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8');
const ops=read('operations-v4.js');const legacy=read('app.js');

test('REG-188: a blocked Height register says "no access" instead of showing an empty list',()=>{
  assert.match(legacy,/hasAnyRoles\(\["Height equipment manager","Height equipment user"\]\)/);
  assert.match(legacy,/You don't have access to the Height Equipment register\. Contact an admin/);
});

test('REG-189: an expired sign-in on an Admin account action is refreshed once, then asks for a fresh sign-in',()=>{
  assert.match(ops,/async function accountAdminAction\(action, payload=\{\}, retried=false\)/);
  assert.match(ops,/unauthenticated\|jwt/);
  assert.match(ops,/auth\.refreshSession\(\)/);
  assert.match(ops,/Your sign-in has expired\. Please sign in again/);
});

test('REG-190: the Notifications card is compact and lists enrolled users and devices',()=>{
  const push=read('push-notifications.js');
  assert.match(push,/class="ops-notify-row"/);
  assert.match(push,/function deviceTable\(devices,users\)/);
  assert.match(push,/Push enabled for:/);
  const fn=read('supabase/functions/notification-control/index.ts');
  assert.match(fn,/async function enrolmentLists/);
  assert.doesNotMatch(fn.match(/async function enrolmentLists[^\n]*/)[0],/endpoint|subscription_json/);
  assert.match(read('.github/workflows/deploy-production-notification-functions.yml'),/DEPLOY PRODUCTION NOTIFICATION FUNCTIONS/);
  assert.match(read('.github/workflows/deploy-staging-notification-functions.yml'),/PRODUCTION_PROJECT_REF/);
});

test('REG-191: a task opens directly under its line and shows its description',()=>{
  assert.match(ops,/<tr class=\\?"ops-task-detail-row\\?"><td colspan=\\?"8\\?">\$\{taskDetailHtml\(t\.id\)\}<\/td><\/tr>/);
  assert.match(ops,/!taskDetailInlineRendered \? taskDetailHtml/);
  assert.match(ops,/What needs doing:<\/strong><br>\$\{esc\(t\.description\)\}/);
  assert.match(ops,/opsScrollBelowHeader\(d\)/);
});

test('REG-192: a filtered Home attention list shows every item, not just 12',()=>{
  assert.match(ops,/const limitRows=state\.homeAttentionFilter==='all'\?12:filtered\.length/);
  assert.match(ops,/filtered\.slice\(0,limitRows\)/);
  assert.match(ops,/Showing the first \$\{limitRows\} of \$\{filtered\.length\}/);
});

test('REG-193: the Maintenance task list shows a total task count',()=>{
  assert.match(ops,/id="opsTaskTotalCount">\$\{state\.tasks\.length\}/);
  assert.match(ops,/total · \$\{active\.length\} active · \$\{completed\.length\} completed/);
});

test('REG-194: the Notifications card shows whether push keys are set up, without exposing them',()=>{
  const fn=read('supabase/functions/notification-control/index.ts');
  assert.match(fn,/vapid_configured:Boolean\(/);
  assert.match(read('push-notifications.js'),/Push keys: \$\{backend\.vapid_configured\?'configured':'not set up'\}/);
  assert.doesNotMatch(fn,/vapid_private[^\n]*json|privateKey/i);
});
