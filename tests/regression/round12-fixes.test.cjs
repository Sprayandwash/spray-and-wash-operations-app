const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ops=read('operations-v4.js');
const legacy=read('app.js');
const index=read('index.html');

test('REG-181: Home shows "Loading..." until sign-in has settled, instead of flashing "Sign in required" or part of the tiles',()=>{
  assert.match(ops,/const homeLoading = !state\.authSettled \|\| state\.signingIn \|\| \(signedIn && state\.homeReadyFor !== state\.user\.id\)/);
  assert.match(ops,/if\(homeLoading\)\{[\s\S]{0,200}ops-home-loading[\s\S]{0,200}\} else if\(!signedIn\)\{[\s\S]{0,120}Sign in required/);
  assert.match(ops,/state\.homeReadyFor = userId; state\.signingIn = false;/);
  assert.match(ops,/state\.authSettled = true; state\.signingIn = false;/);
  assert.match(legacy,/dispatchEvent\(new CustomEvent\("sw:signing-in"\)\)/);
  assert.match(legacy,/sw:signin-failed/);
  assert.match(ops,/addEventListener\('sw:signing-in'/);
});

test('REG-182: the Account menu has a gap between the weekly email button and Sign out',()=>{
  assert.match(index,/\.accountPanel \.pushSettings\{margin-bottom:14px\}/);
  assert.match(index,/\.accountPanel>button\{display:block;margin-top:14px\}/);
});

test('REG-183: every date field uses the standard picker; Height "Date manufactured" is a month picker',()=>{
  assert.match(index,/id="eqMadePick" type="month"/);
  assert.match(index,/id="eqFirstPick" type="date"/);
  assert.match(index,/id="eqRetiredPick" type="date"/);
  assert.doesNotMatch(index,/id="eq(Made|First|Retired)(Day|Year)"/);
  assert.match(legacy,/hidden\.value=!v\?"":\(prefix==="eqMade"&&\/\^\\d\{4\}-\\d\{2\}\$\/\.test\(v\)\?v\+"-01":v\)/);
  // No typed text boxes are used for dates anywhere in the Operations screens (a vehicle's model year is a number, not a date).
  assert.doesNotMatch(ops,/<input[^>]*(placeholder="(dd|DD|yyyy|YYYY)[^"]*"|id="(?!opsVehicleYear)[A-Za-z]*(Day|Year)")/);
  assert.match(read('CLAUDE.md'),/UI convention — date fields/);
});

test('REG-184: a duplicate serial number gets a plain-language message',()=>{
  assert.match(legacy,/function friendlyDbError\(message\)/);
  assert.match(legacy,/equipment_serial_key[\s\S]{0,120}already in the register/);
  const saves=legacy.match(/alert\(friendlyDbError\(r\.error\.message\)\)/g)||[];
  assert.equal(saves.length,2);
});

test('REG-185: Save and Submit buttons show a saving state and a Saved message',()=>{
  assert.match(legacy,/btn\.textContent = 'Saving\.\.\.'/);
  assert.match(legacy,/\['saveEquipment','saveInspection','saveCrop'\]/);
  assert.match(legacy,/addEventListener\('submit'/);
  assert.match(legacy,/sw:operations-rendered/);
  assert.match(index,/\.is-saving::before\{[^}]*animation:swspin/);
  assert.match(index,/\.swToast\.show\{opacity:1\}/);
});

test('REG-186: a staging test records every Home screen shown while signing in',()=>{
  const spec=read('tests/e2e/staging/signin-home-render.spec.cjs');
  assert.match(spec,/HOME TIMELINE/);
  assert.match(spec,/Home showed "Sign in required" after Sign in was pressed/);
  assert.match(read('playwright.staging.mobile-harness.config.cjs'),/signin-home-render\.spec\.cjs/);
});

test('REG-187: the header says "Signing in..." while Home is loading after Sign in',()=>{
  assert.match(ops,/state\.signingIn \? 'Signing in\.\.\.' : 'Not signed in'/);
  assert.match(ops,/sw:signing-in', \(\) => \{[^\n]*refreshTopUserSummary\(\)/);
});
