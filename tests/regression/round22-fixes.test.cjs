const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const sw=fs.readFileSync(path.join(__dirname,'..','..','service-worker.js'),'utf8');

test('REG-210: tapping a push notification opens the app, not the site root',()=>{
  const block=sw.slice(sw.indexOf("addEventListener('notificationclick'"));
  assert.match(block,/new URL\(event\.notification\.data\?\.url \|\| '\.\/', self\.registration\.scope\)/);
  assert.doesNotMatch(block,/self\.location\.origin/);
  assert.match(block,/client\.url\.startsWith\(self\.registration\.scope\)/);
});

test('REG-210: the service worker cache name was bumped so phones pick up the fix',()=>{
  assert.match(sw,/const CACHE_NAME = 'spray-wash-operations-v4-0-111';/);
});
