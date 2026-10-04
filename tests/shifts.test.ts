import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, createMonth, emptyData, parseProd, validateData } from '../src/domain.ts';
import { defaultHours, duration, expectedHours, parseClock, shiftError, shiftTotals } from '../src/shifts.ts';
import type { Shift } from '../src/shifts.ts';

test('two periods exclude the break, and only positive extra hours accumulate', () => {
  const shift: Shift = { times: [480, 720, 780, 1066], expected: 500, holiday: false };
  assert.deepEqual(shiftTotals(shift), { worked: 526, extra: 26, complete: true, partial: false });
  assert.equal(shiftTotals({ ...shift, times: [480, 720, 780, 1020] }).extra, 0);
  assert.equal(shiftTotals(shift, true).extra, 526);
  assert.equal(duration(60 * 150 + 26), '150h26');
});

test('single period, open periods, absent clock times and same-day ordering', () => {
  const shift: Shift = { times: [755, 1261, null, null], expected: 500, holiday: false };
  assert.equal(shiftTotals(shift).extra, 6);
  assert.equal(shiftTotals({ ...shift, times: [480, 720, 780, null] }).extra, null);
  assert.equal(shiftTotals({ ...shift, times: [480, 720, 780, null] }).worked, 240);
  assert.equal(shiftTotals(undefined).extra, null);
  for (const times of [[null, 500, null, null], [500, 400, null, null], [480, 720, 700, 900], [480, null, 700, 900], [0, 0, null, null]]) {
    assert.ok(shiftError({ ...shift, times: times as Shift['times'] }));
  }
  assert.equal(shiftError(shift), null);
  assert.equal(parseClock('00:00'), 0); assert.equal(parseClock('24:00'), null);
});

test('Sunday, holiday defaults and historical expected duration', () => {
  const defaults = defaultHours();
  assert.equal(expectedHours('2026-10-04', defaults), 360);
  assert.equal(expectedHours('2026-10-05', defaults), 500);
  assert.equal(expectedHours('2026-10-04', defaults, true), 180);
  const shift: Shift = { times: [600, 1100, null, null], expected: 500, holiday: false };
  defaults.regular = 400;
  assert.equal(shiftTotals(shift).extra, 0);
});

test('Prod average includes entered zero, ignores blanks and future days', () => {
  const month = createMonth('2026-10');
  month.days['2026-10-01'].prod = 233; month.days['2026-10-02'].prod = 0; month.days['2026-10-20'].prod = 999;
  assert.equal(calculate(month, '2026-10-04').prodAverage, 116.5);
  assert.equal(calculate(month, '2026-10-04').prodCount, 2);
  assert.equal(parseProd('2,33'), 233); assert.equal(parseProd('0'), 0);
  for (const value of ['-1', '2,333', '1.234,56', 'abc']) assert.equal(parseProd(value), null);
});

test('legacy backups preserve the original three goal positions and sales', () => {
  const old = { version: 1, months: { '2026-09': { goals: [10000, 20000, 30000], days: createMonth('2026-09').days } } };
  old.months['2026-09'].days['2026-09-01'].amount = 5000;
  const migrated = validateData(old);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.months['2026-09'].goals, [10000, 20000, 30000]);
  assert.equal(migrated.months['2026-09'].impulso, null);
  assert.equal(migrated.months['2026-09'].days['2026-09-01'].amount, 5000);
});

test('v2 backup roundtrip with all fields and Impulso validation', () => {
  const data = emptyData(), month = createMonth('2026-10'); data.months['2026-10'] = month;
  month.goals = [10000, 20000, 30000]; month.impulso = 5000;
  month.days['2026-10-01'].prod = 233;
  month.shifts['2026-10-01'] = { times: [480, 720, 780, 1066], expected: 500, holiday: true };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(calculate(month, '2026-10-01').impulso.target, 5000);
  month.impulso = 10001; assert.throws(() => validateData(data));
  month.impulso = 5000; month.shifts['2026-10-01'].times[1] = 400; assert.throws(() => validateData(data));
});
