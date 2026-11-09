const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('operations-v4.js');

test('REG-166: app icons are the redrawn v4.0.91 files and the manifest also offers a maskable icon',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const srcs=manifest.icons.map(i=>i.src);
  assert.ok(srcs.includes('assets/spray-wash-app-icon-192-v4.0.91.png'));
  assert.ok(srcs.includes('assets/spray-wash-app-icon-512-v4.0.91.png'));
  assert.ok(manifest.icons.some(i=>i.purpose==='maskable'&&i.src.includes('maskable')));
  for(const f of srcs) assert.ok(fs.existsSync(path.join(root,f)),`${f} must exist`);
  assert.match(read('index.html'),/favicon-v4\.0\.91\.ico/);
});

test('REG-167: a refused account action shows the server\'s own message, not "non-2xx"',()=>{
  assert.match(app,/r\.error\.context\.json\(\)/);
  assert.match(app,/Account action failed: \$\{reason \|\| r\.error\.message\}/);
});

test('REG-168: opening or editing an asset scrolls the form into view below the header bars',()=>{
  assert.match(app,/id="opsAssetEditorCard"/);
  assert.ok((app.match(/opsScrollBelowHeader\(ed\)/g)||[]).length>=4,'add, edit vehicle, edit machinery and add machinery all scroll');
});

test('REG-169: only one vehicle card is open at a time',()=>{
  assert.match(app,/details\.ops-vehicle-asset\[open\]/);
});

test('REG-170: leaving a half-edited asset form asks first',()=>{
  assert.match(app,/You have unsaved changes on this form\. Leave without saving them\?/);
  assert.match(app,/state\.assetEditorDirty/);
});

test('REG-171: machinery with no Driver or Passenger side is still listed under "No side set"',()=>{
  assert.match(app,/No side set/);
  assert.match(app,/const noSide = machineryRows\.filter/);
});

test('REG-172: the vehicle card spreads its details across the full width',()=>{
  assert.match(app,/ops-vehicle-body-row/);
  assert.doesNotMatch(app,/<div class="ops-section-title"><div><\/div>\s*<div class="ops-spec-list">/);
});

test('REG-173: an empty vehicle dropdown explains that access may be missing, once data has loaded',()=>{
  assert.match(app,/opsNoVehiclesNote/);
  assert.match(app,/state\.dataLoadedOnce && \['vehicle','combined'\]/);
});

test('REG-174: purging a test account is Admin-only, previews first, and is enforced on the server',()=>{
  assert.match(app,/async function purgeTestAccount/);
  assert.match(app,/data-ops-account-purge/);
  assert.match(app,/Type PURGE \(capitals\) to confirm/);
  const fn=read('supabase/functions/account-admin/index.ts');
  assert.match(fn,/action==='purge_preview'\|\|action==='purge'/);
  assert.match(fn,/confirmation_word.*!==.PURGE./);
  const sql=read('supabase/migrations/20261109_purge_test_account.sql');
  for(const gate of ['cannot purge your own account','Admin accounts cannot be purged','Block the account before purging','never purged','more than the']) assert.ok(sql.includes(gate),`gate: ${gate}`);
  assert.match(sql,/grant execute on function public\.purge_test_account\(uuid, uuid, boolean\) to service_role/);
});
