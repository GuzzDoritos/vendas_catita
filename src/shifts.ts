export type ShiftDefaults = { regular: number; sunday: number; holiday: number };
export type Shift = { times: [number | null, number | null, number | null, number | null]; expected: number; holiday: boolean };
export const defaultHours = (): ShiftDefaults => ({ regular: 500, sunday: 360, holiday: 180 });
export const duration = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
export const clockInput = (minutes: number | null) => minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export function parseClock(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes;
}
export function expectedHours(date: string, defaults: ShiftDefaults, holiday = false) {
  return holiday ? defaults.holiday : new Date(`${date}T12:00:00`).getDay() === 0 ? defaults.sunday : defaults.regular;
}
export function shiftError(shift: Shift): string | null {
  if (!Array.isArray(shift.times) || shift.times.length !== 4 || shift.times.some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 1439))) return 'Horário inválido.';
  if (!Number.isInteger(shift.expected) || shift.expected < 0 || shift.expected > 1439 || typeof shift.holiday !== 'boolean') return 'Jornada prevista inválida.';
  let last = -1, gap = false;
  for (const time of shift.times) {
    if (time === null) { gap = true; continue; }
    if (gap) return 'Preencha os horários em ordem, sem pular uma entrada ou saída.';
    if (time <= last) return 'Os horários devem seguir a ordem do dia. A saída precisa ser depois da entrada.';
    last = time;
  }
  return null;
}
export function shiftTotals(shift: Shift | undefined, off = false) {
  if (!shift || shift.times.every(t => t === null)) return { worked: 0, extra: null, complete: false, partial: false };
  const [a, b, c, d] = shift.times;
  const worked = (a !== null && b !== null ? b - a : 0) + (c !== null && d !== null ? d - c : 0);
  const partial = (a !== null && b === null) || (c !== null && d === null);
  return { worked, extra: partial ? null : Math.max(0, worked - (off ? 0 : shift.expected)), complete: !partial, partial };
}
