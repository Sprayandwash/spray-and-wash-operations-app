const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Fast, source-level guards for the Training bugs in REG-146 to REG-155. They run on every pull request in the
// "Regression tests" workflow. The full browser checks for the same bugs are in tests/e2e/staging/
// (training-fixes-regression.spec.cjs and app-layout-banner-header.spec.cjs).
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ops = read('operations-v4.js');
const index = read('index.html');

// Pull a named function out of the app's single IIFE so its real logic can be exercised.
function extract(name) {
  const start = ops.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let i = ops.indexOf('{', start), depth = 0;
  for (; i < ops.length; i++) { if (ops[i] === '{') depth++; else if (ops[i] === '}' && --depth === 0) break; }
  return ops.slice(start, i + 1);
}

test('REG-146: forms keep typed values and scroll across redraws, and failed saves show errors beside the field', () => {
  assert.match(ops, /function opsCaptureFormDraft\(/);
  assert.match(ops, /function opsRestoreFormDraft\(/);
  assert.match(ops, /function opsFieldError\(/);
  assert.match(ops, /\.ops-table-wrap/); // inner scroll containers are restored too
});

test('REG-147: record date rules refuse impossible dates, and Completed needs evidence', () => {
  const addMonths = extract('addMonthsClamped');
  const problems = extract('trainingRecordDateProblems');
  const run = new Function(`const TRAINING_MIN_DATE='2000-01-01';const TRAINING_MAX_YEARS_AHEAD=5;${addMonths}${problems}return trainingRecordDateProblems;`)();
  assert.equal(run('1999-12-31', '', '2026-11-03').length, 1, 'before 2000 refused');
  assert.equal(run('2027-01-01', '', '2026-11-03').length, 1, 'future completed date refused');
  assert.equal(run('2026-01-10', '2026-01-10', '2026-11-03').length, 1, 'expiry must be after completed');
  assert.equal(run('2026-01-10', '2040-01-10', '2026-11-03').length, 1, 'expiry more than 5 years ahead refused');
  assert.equal(run('2026-01-10', '2028-01-10', '2026-11-03').length, 0, 'a normal record passes');
  assert.match(ops, /Needed before a record can be marked Completed/);
});

test('REG-148: duplicate course names are refused and archived lists are collapsed', () => {
  assert.match(ops, /already exists/);
  assert.match(ops, /maxlength="100"/);
  assert.match(ops, /data-ops-keep-open="archived-courses"/);
});

test('REG-149: a sole trader has one person and a contractor has administrators who may not work on jobs', () => {
  assert.match(ops, /is_company_admin/);
  assert.match(ops, /needs_training/);
  assert.match(ops, /Primary contact/);
  assert.ok(fs.existsSync(path.join(root, 'supabase/migrations/20261102_contractor_directory_and_admins.sql')));
});

test('REG-150: a person page starts with every course closed; Edit opens in place without scrolling (REG-198)', () => {
  assert.doesNotMatch(ops, /opsScrollBelowHeader/);
  assert.match(ops, /state\.trainingExpandedCourseIds = new Set\(\[courseId\]\)/); // opening one closes the others
});

test('REG-151: courses reorder by dragging only, and Matrix columns are fixed width with the person name capped', () => {
  assert.doesNotMatch(ops, /data-ops-course-move/);
  assert.doesNotMatch(ops, /id="opsCourseOrder"/);
  assert.match(ops, /draggable="true" data-ops-course-row/);
  assert.match(ops, /<colgroup><col style="width:150px">/);
  assert.match(ops, /ops-matrix-head-text/);
});

test('REG-152: only the field with the problem is red, the Register has a course filter, and evidence downloads skip missing files', () => {
  const fieldError = extract('opsFieldError');
  assert.match(fieldError, /isControl \? \(el\.closest\('label'\) \|\| el\.parentElement\) : el/, 'a non-control (evidence block) is its own holder, not the whole form');
  assert.match(ops, /id="opsRegisterCourse"/);
  const zip = extract('trainingZipAndDownload');
  assert.match(zip, /skipped\+\+/);
  assert.match(zip, /NOT INCLUDED/);
  assert.match(ops, /data-ops-download-register-evidence/);
  assert.doesNotMatch(ops, /data-ops-register-select/, 'the Register table is view-only');
});

test('REG-153: the printed Register carries a letterhead and a sole trader contact always works on jobs', () => {
  assert.match(ops, /lh-logo/);
  assert.match(ops, /Contacts/);
});

test('REG-154: the staging banner stays fixed, the app header scrolls away and the tab bar sits under the banner', () => {
  assert.match(index, /header\{position:relative;z-index:20;/);
  assert.doesNotMatch(index, /header\{position:sticky/);
  assert.match(index, /\.stagingEnvironment \.tabs\{top:var\(--staging-banner-height\)\}/);
  assert.match(index, /setProperty\('--staging-banner-height'/);
});

test('REG-155: Register and Download evidence are collapsible and open collapsed, the people dropdown closes on outside click, types read External Qualification / Internal Training', () => {
  assert.match(ops, /id="opsRegisterPanel"/);
  assert.match(ops, /id="opsEvidencePanel"/);
  assert.match(ops, /state\.keepOpen\['register-results'\] = false; state\.keepOpen\['evidence-panel'\] = false/);
  assert.match(ops, /!d\.contains\(ev\.target\)\) d\.open = false/);
  assert.match(ops, /'Internal Training' : 'External Qualification'/);
  assert.doesNotMatch(ops, /formal qualification/);
});
