const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ops = fs.readFileSync(path.resolve(__dirname, '../..', 'operations-v4.js'), 'utf8');

test('REG-156: a missing required field is flagged in red beside that field, not with a popup alone', () => {
  assert.match(ops, /function opsFlagField\(/);
  for (const id of ['opsInspectionVehicle', 'opsMachinerySide', 'opsTransferSide', 'opsLogEntryVehicle', 'opsLogEntryTarget',
    'opsPlannedMaintenanceTarget', 'opsPlannedMaintenanceName', 'opsPlannedMaintenanceFrequency',
    'opsAccountFirst', 'opsAccountLast', 'opsAccountEmail', 'opsAccountTempPassword']) {
    assert.match(ops, new RegExp(`opsFlagField\\('${id}'`), `${id} must be flagged in red when missing`);
    assert.match(ops, new RegExp(`id="${id}"`), `${id} must exist in the form`);
  }
  assert.doesNotMatch(ops, /alert\('Select a vehicle before submitting\.'\)/);
  assert.doesNotMatch(ops, /alert\('Choose an asset, enter the planned item/);
});

test('REG-157: every Operations form turns all its missing required fields red together instead of using the browser pop-up', () => {
  assert.match(ops, /window\.__opsRequiredFieldsAllRed/);
  assert.match(ops, /form\.closest\('#opsShell'\)/);
  assert.match(ops, /!el\.checkValidity\(\)/);
  assert.match(ops, /ev\.stopImmediatePropagation\(\)/);
  assert.match(ops, /\}, true\);/, 'runs in the capture phase so it goes before each form\'s own handler');
});

