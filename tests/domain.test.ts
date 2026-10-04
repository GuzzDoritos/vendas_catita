import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, createMonth, emptyData, monthDates, parseMoney, shiftMonth, todayKey, validateData } from '../src/domain.ts';

test('reproduz os saldos e as médias da planilha em 20/09/2026', () => {
  const month = createMonth('2026-09');
  month.goals = [5176500, 6465500, 7240500];
  month.days['2026-09-19'].amount = 2969156;
  for (const day of ['06', '07', '14', '20', '27', '29']) month.days[`2026-09-${day}`].off = true;
  const result = calculate(month, '2026-09-20');
  assert.equal(result.total, 2969156);
  assert.equal(result.remaining, 8);
  assert.deepEqual(result.goals.map(g => g.daily), [275918, 437043, 533918]);
});

test('hoje parcial, encerrado, reaberto e folga', () => {
  const month = createMonth('2026-09'); month.goals = [10000, 20000, 30000];
  month.days['2026-09-29'].amount = 2000;
  assert.equal(calculate(month, '2026-09-29').goals[0].daily, 4000);
  month.days['2026-09-29'].closed = true;
  assert.equal(calculate(month, '2026-09-29').goals[0].daily, 8000);
  month.days['2026-09-29'].closed = false;
  assert.equal(calculate(month, '2026-09-29').remaining, 2);
  month.days['2026-09-30'].off = true;
  assert.equal(calculate(month, '2026-09-29').goals[0].daily, 8000);
  month.days['2026-09-29'].off = true;
  assert.equal(calculate(month, '2026-09-29').goals[0].daily, null);
  assert.equal(calculate(month, '2026-09-29').total, 2000);
});

test('meta atingida, mês passado e futuro, arredondamento e ausência de meta', () => {
  const month = createMonth('2026-09'); month.goals = [10000, 20000, 30001];
  month.days['2026-09-01'].amount = 10000;
  assert.equal(calculate(month, '2026-09-28').goals[2].daily, 6667);
  assert.equal(calculate(month, '2026-10-01').goals[0].daily, 0);
  assert.equal(calculate(month, '2026-10-01').goals[1].daily, null);
  assert.equal(calculate(month, '2026-08-01').total, 0);
  assert.equal(calculate(month, '2026-08-01').remaining, 30);
  assert.equal(calculate(createMonth('2026-09'), '2026-09-01').goals[0].daily, null);
});

test('zero, lançamento ausente e correção sem duplicação', () => {
  const month = createMonth('2026-09');
  month.days['2026-09-01'].amount = 0;
  assert.equal(calculate(month, '2026-09-03').missing, 1);
  month.days['2026-09-02'].amount = 15000;
  month.days['2026-09-02'].amount = 10000;
  assert.equal(calculate(month, '2026-09-03').total, 10000);
});

test('datas, ano bissexto e fuso de São Paulo', () => {
  assert.equal(monthDates('2024-02').length, 29);
  assert.equal(monthDates('2026-02').length, 28);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(todayKey(new Date('2026-09-21T01:00:00Z')), '2026-09-20');
});

test('valores em reais são convertidos para centavos com validação', () => {
  assert.equal(parseMoney('1.250,50'), 125050);
  assert.equal(parseMoney('0,1'), 10);
  assert.equal(parseMoney('R$ 1.000'), 100000);
  for (const input of ['-5', 'abc', '', '1,234', '12.50', 'Infinity']) assert.equal(parseMoney(input), null);
});

test('backup completo faz roundtrip e rejeita corrupção', () => {
  const data = emptyData(); data.months['2026-09'] = createMonth('2026-09');
  data.months['2026-09'].days['2026-09-03'] = { amount: 5000, off: true, closed: true, prod: null };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.throws(() => validateData({ version: 999, months: {} }));
  data.months['2026-09'].days['2026-09-03'].amount = -1;
  assert.throws(() => validateData(data));
  data.months['2026-09'].days['2026-09-03'].amount = null;
  assert.throws(() => validateData(data));
});
