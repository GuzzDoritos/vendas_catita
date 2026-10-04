import { defaultHours, shiftError } from './shifts.ts';
import type { Shift, ShiftDefaults } from './shifts.ts';
export const GOALS = ['Gatilho', 'Acelera', 'Incrível'] as const;
export const ALL_GOALS = ['Impulso', ...GOALS] as const;
export type Day = { off: boolean; amount: number | null; closed: boolean; prod: number | null };
export type Month = { goals: [number, number, number]; impulso: number | null; days: Record<string, Day>; shifts: Record<string, Shift>; hours: ShiftDefaults };
export type Data = { version: 2; months: Record<string, Month> };
export const STORAGE_KEY = 'catita.v1';
export const emptyData = (): Data => ({ version: 2, months: {} });

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
    impulso: null, shifts: {}, hours: defaultHours(),
    days: Object.fromEntries(monthDates(key).map(date => [date, { off: false, amount: null, closed: false, prod: null }])),
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
export const prodLabel = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
export function parseProd(value: string): number | null {
  if (!/^\d{1,4}([,.]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, decimals = ''] = value.trim().split(/[,.]/);
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

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
  const prods = entries.filter(([date, day]) => date <= today && day.prod !== null).map(([, day]) => day.prod!);
  const goalResult = (target: number) => {
    const gap = Math.max(0, target - total);
    return { target, gap, percent: target > 0 ? total / target * 100 : 0,
      daily: target === 0 ? null : gap === 0 ? 0 : remaining > 0 ? Math.ceil(gap / remaining) : null };
  };
  return {
    total, remaining, missing, workdays,
    prodAverage: prods.length ? prods.reduce((sum, value) => sum + value, 0) / prods.length : null,
    prodCount: prods.length,
    impulso: goalResult(month.impulso ?? 0), goals: month.goals.map(goalResult),
  };
}

export function validateData(input: unknown): Data {
  if (!input || typeof input !== 'object') throw new Error('Arquivo inválido.');
  const raw = input as { version: number; months: Record<string, Month> };
  if (![1, 2].includes(raw.version) || !raw.months || typeof raw.months !== 'object' || Array.isArray(raw.months)) {
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
    if (raw.version === 2) {
      if (month.impulso !== null && (!validCents(month.impulso) || month.impulso === 0 || month.impulso > month.goals[0])) throw new Error('Impulso deve ser positivo e não ultrapassar Gatilho.');
      normalized.impulso = month.impulso;
      if (!month.hours || !['regular', 'sunday', 'holiday'].every(k => Number.isInteger(month.hours[k as keyof typeof month.hours]) && month.hours[k as keyof typeof month.hours] >= 0 && month.hours[k as keyof typeof month.hours] <= 1439)) throw new Error('Jornadas inválidas.');
      normalized.hours = { regular: month.hours.regular, sunday: month.hours.sunday, holiday: month.hours.holiday };
      if (!month.shifts || typeof month.shifts !== 'object' || Array.isArray(month.shifts)) throw new Error('Ponto inválido.');
      for (const [date, shift] of Object.entries(month.shifts)) {
        if (!dates.includes(date) || !shift || shiftError(shift)) throw new Error('Horários de ponto inválidos.');
        normalized.shifts[date] = { times: [...shift.times], expected: shift.expected, holiday: shift.holiday };
      }
    }
    for (const date of dates) {
      const day = month.days[date];
      if (!day || typeof day.off !== 'boolean' || typeof day.closed !== 'boolean' || !(day.amount === null || validCents(day.amount)) || (day.closed && day.amount === null)) throw new Error('Lançamento inválido.');
      const prod = raw.version === 1 ? null : day.prod;
      if (prod !== null && (!Number.isInteger(prod) || prod < 0 || prod > 999999)) throw new Error('Prod inválido.');
      normalized.days[date] = { off: day.off, amount: day.amount, closed: day.closed, prod };
    }
    clean.months[key] = normalized;
  }
  return clean;
}
