const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ops = fs.readFileSync(path.resolve(__dirname, '../..', 'operations-v4.js'), 'utf8');

test('REG-158: on a phone the Competency list, record form and course form fit the screen and line up', () => {
  assert.match(ops, /\.ops-person-comp select \{[^}]*min-width:0; max-width:100%/, 'Competency list can shrink to the screen');
  assert.match(ops, /\.ops-rec-left \.ops-r-a:nth-child\(1\) \{ grid-column:span 6; \}/, 'Status on its own row on a phone');
  assert.match(ops, /\.ops-rec-left \.ops-r-a:nth-child\(2\), \.ops-rec-left \.ops-r-a:nth-child\(3\) \{ grid-column:span 3; \}/, 'Completed and Expiry side by side');
  assert.match(ops, /grid-template-columns:96px minmax\(0,1fr\); \}/, 'small Validity box beside a wide NZQA box on a phone');
  assert.match(ops, /\.ops-course-row1 > label:nth-child\(1\), \.ops-course-row1 > label:nth-child\(2\) \{ grid-column:1 \/ -1; \}/, 'Course name and Type full width');
});

test('REG-159: the course catalogue is split into External Qualification and Internal Training, ordered within each section', () => {
  assert.match(ops, /section\('External Qualification'/);
  assert.match(ops, /section\('Internal Training'/);
  assert.match(ops, /data-ops-catalog-section=/);
  assert.match(ops, /trainingIsInternalCourse\(dragged\) !== trainingIsInternalCourse\(target\)\) return;/, 'a course cannot be dropped into the other section');
});

test('REG-160: Home tiles follow one fixed order with My Training before Admin, and Admin always last', () => {
  const start = ops.indexOf('function renderModuleHome()');
  const body = ops.slice(start, start + 2500);
  const order = ['Vehicle Checks', 'Height Equipment', "'Maintenance'", "'Training'", 'My Training', "'Admin'"].map(k => body.indexOf("moduleCard(" + (k.startsWith("'") ? k : "'" + k + "'")));
  assert.ok(order.every(i => i > -1), 'all six tiles are present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'tiles are in the agreed order');
});

test('REG-161: asset cards keep their sections open on refresh and show the photo and files', () => {
  assert.match(ops, /class="ops-vehicle-asset" data-ops-keep-open="vehicle-/, 'vehicle card stays open');
  assert.match(ops, /class="ops-subassets" data-ops-keep-open="subassets-/, 'Installed Machinery stays open');
  assert.match(ops, /class="ops-card ops-unassigned" data-ops-keep-open="standalone-machinery"/);
  assert.match(ops, /function assetMediaViewHtml\(/);
  assert.match(ops, /assetMediaViewHtml\('washing_equipment', w\)/, 'machinery cards show photo and files');
  assert.match(ops, /assetMediaViewHtml\('vehicle', v\)/, 'vehicle cards show photo and files');
});

test('REG-162: a chosen asset photo survives the page refreshing, shows straight away, and only one source is kept', () => {
  assert.match(ops, /function opsCaptureFiles\(/);
  assert.match(ops, /function opsRestoreFiles\(/);
  assert.match(ops, /opsRestoreFiles\(shell, savedFiles\)/, 'files are put back after every redraw');
  assert.match(ops, /function assetPhotoPreview\(/);
  assert.match(ops, /if\(input\.files\?\.length && other\) other\.value = ''/, 'Camera and Gallery never both stay selected');
  assert.doesNotMatch(ops, /<label class="ops-span-2">Asset photo/, 'no label nested inside a label (it double-fires on phones)');
});
