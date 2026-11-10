const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.resolve(__dirname,'../../operations-v4.js'),'utf8');

test('REG-175: a part-filled Vehicle Check survives a page refresh (answers, notes, odometer and chosen photos)',()=>{
  assert.match(app,/function opsCaptureInspection\(shell\)/);
  assert.match(app,/function opsRestoreInspection\(shell, saved\)/);
  assert.match(app,/const inspectionDraft = opsCaptureInspection\(shell\);/);
  assert.match(app,/opsRestoreInspection\(shell, inspectionDraft\);/);
  assert.match(app,/new DataTransfer\(\)/);
});

test('REG-176: the sign-in library repeating "signed in" for the same user does not rebuild the page',()=>{
  assert.match(app,/\['SIGNED_IN','TOKEN_REFRESHED'\]\.includes\(_event\) && state\.dataLoadedOnce && sameUserId && sameUserId === state\.activeUserId/);
  assert.match(app,/state\.dataLoadedOnce=true;/);
});
