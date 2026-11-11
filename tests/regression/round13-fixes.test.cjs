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
