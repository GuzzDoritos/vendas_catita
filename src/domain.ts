export const GOALS = ['Gatilho', 'Acelera', 'Incrível'] as const;
export type Day = { off: boolean; amount: number | null; closed: boolean };
export type Month = { goals: [number, number, number]; days: Record<string, Day> };
export type Data = { version: 1; months: Record<string, Month> };
export const STORAGE_KEY = 'catita.v1';
export const emptyData = (): Data => ({ version: 1, months: {} });

export function todayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthDates(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(year, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function createMonth(key: string): Month {
  return {
    goals: [0, 0, 0],
    days: Object.fromEntries(monthDates(key).map(date => [date, { off: false, amount: null, closed: false }])),
  };
}

export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const money = (cents: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(cents / 100);
export const moneyInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

// Accept Brazilian monetary input, never silently discard malformed characters.
export function parseMoney(input: string): number | null {
  const value = input.trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replaceAll('.', '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 100_000_000_00 ? cents : null;
}

export function calculate(month: Month, today: string) {
  const entries = Object.entries(month.days);
  const total = entries.reduce((sum, [date, day]) => sum + (date <= today ? day.amount ?? 0 : 0), 0);
  const remaining = entries.filter(([date, day]) => !day.off && (date > today || (date === today && !day.closed))).length;
  const missing = entries.filter(([date, day]) => date < today && !day.off && day.amount === null).length;
  const workdays = entries.filter(([, day]) => !day.off).length;
  return {
    total, remaining, missing, workdays,
    goals: month.goals.map(target => {
      const gap = Math.max(0, target - total);
      return { target, gap, percent: target > 0 ? total / target * 100 : 0,
        daily: target === 0 ? null : gap === 0 ? 0 : remaining > 0 ? Math.ceil(gap / remaining) : null };
    }),
  };
}

export function validateData(input: unknown): Data {
  if (!input || typeof input !== 'object') throw new Error('Arquivo inválido.');
  const raw = input as Data;
  if (raw.version !== 1 || !raw.months || typeof raw.months !== 'object' || Array.isArray(raw.months)) {
    throw new Error('Formato de backup não reconhecido.');
  }
  const validCents = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_00;
  const clean = emptyData();
  for (const [key, month] of Object.entries(raw.months)) {
    if (!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(key) || !month || !Array.isArray(month.goals) || month.goals.length !== 3 || !month.goals.every(validCents)) throw new Error('Mês ou metas inválidos.');
    if (!(month.goals[0] <= month.goals[1] && month.goals[1] <= month.goals[2])) throw new Error('As metas do backup estão fora de ordem.');
    const dates = monthDates(key);
    if (!month.days || typeof month.days !== 'object' || Object.keys(month.days).length !== dates.length) throw new Error('Calendário incompleto.');
    const normalized = createMonth(key);
    normalized.goals = [...month.goals];
    for (const date of dates) {
      const day = month.days[date];
      if (!day || typeof day.off !== 'boolean' || typeof day.closed !== 'boolean' || !(day.amount === null || validCents(day.amount)) || (day.closed && day.amount === null)) throw new Error('Lançamento inválido.');
      normalized.days[date] = { off: day.off, amount: day.amount, closed: day.closed };
    }
    clean.months[key] = normalized;
  }
  return clean;
}
