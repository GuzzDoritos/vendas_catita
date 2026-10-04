import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Month } from './domain';
import { monthDates } from './domain';
import { clockInput, duration, expectedHours, parseClock, shiftError, shiftTotals } from './shifts';
import type { Shift } from './shifts';
import Modal from './Modal';

type Props = { month: Month; monthKey: string; today: string; disabled: boolean; onSave: (month: Month) => Promise<boolean> };
export default function ShiftControl({ month, monthKey, today, disabled, onSave }: Props) {
  const [editor, setEditor] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const entries = Object.entries(month.shifts).filter(([date]) => date <= today).map(([date, shift]) => shiftTotals(shift, month.days[date].off));
  const worked = entries.reduce((sum, shift) => sum + shift.worked, 0);
  const extra = entries.reduce((sum, shift) => sum + (shift.extra ?? 0), 0);
  const partial = entries.filter(shift => shift.partial).length;
  return <section className="shift-section" aria-label="Controle de ponto">
    <div className="section-heading"><div><h2>Controle de ponto</h2><p>Duas entradas e saídas, sem contar o intervalo.</p></div><button className="text-button" disabled={disabled} onClick={() => setSettings(true)}>Jornadas</button></div>
    <div className="hours-summary"><div><span>Horas trabalhadas</span><strong>{duration(worked)}</strong></div><div><span>Horas extras</span><strong>{duration(extra)}</strong></div></div>
    {partial > 0 && <p className="calculation-note">{partial} ponto(s) incompleto(s). Horas extras só são apuradas com as saídas preenchidas.</p>}
    <div className="shift-table-wrap"><table className="shift-table"><thead><tr><th>Dia</th><th>Entrada / saída</th><th>Trabalhadas</th><th>Extras</th><th><span className="sr-only">Editar</span></th></tr></thead><tbody>
      {monthDates(monthKey).map(date => {
        const shift = month.shifts[date], off = month.days[date].off;
        const totals = shiftTotals(shift, off);
        return <tr key={date} className={date === today ? 'shift-today' : ''}>
          <td><strong>{date.slice(8)}</strong><small>{off ? 'Folga' : shift?.holiday ? 'Feriado' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))}</small></td>
          <td>{shift && shift.times.some(v => v !== null) ? <>{clockInput(shift.times[0]) || '—'} – {clockInput(shift.times[1]) || '…'}{shift.times[2] !== null && <small>{clockInput(shift.times[2])} – {clockInput(shift.times[3]) || '…'}</small>}{totals.partial && <small>Em andamento</small>}</> : '—'}</td>
          <td>{totals.complete || totals.partial ? duration(totals.worked) : '—'}</td><td>{totals.extra === null ? '—' : duration(totals.extra)}</td>
          <td><button className="text-button" disabled={disabled} aria-label={`Editar ponto ${date}`} onClick={() => setEditor(date)}>Editar</button></td>
        </tr>;
      })}
    </tbody></table></div>
    {editor && <ShiftEditor key={editor} date={editor} today={today} month={month} onClose={() => setEditor(null)} onSave={async (shift, off) => {
      const shifts = { ...month.shifts }; if (shift) shifts[editor] = shift; else delete shifts[editor];
      if (await onSave({ ...month, shifts, days: { ...month.days, [editor]: { ...month.days[editor], off } } })) setEditor(null);
    }} />}
    {settings && <HoursEditor month={month} onClose={() => setSettings(false)} onSave={async hours => { if (await onSave({ ...month, hours })) setSettings(false); }} />}
  </section>;
}

function ShiftEditor({ date, today, month, onClose, onSave }: { date: string; today: string; month: Month; onClose: () => void; onSave: (shift: Shift | null, off: boolean) => Promise<void> }) {
  const initial = month.shifts[date];
  const [times, setTimes] = useState(initial ? initial.times.map(clockInput) : ['', '', '', '']);
  const [holiday, setHoliday] = useState(initial?.holiday ?? false);
  const [off, setOff] = useState(month.days[date].off);
  const [expected, setExpected] = useState(clockInput(initial?.expected ?? expectedHours(date, month.hours)));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const future = date > today;
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    const parsed = times.map(time => time === '' ? null : parseClock(time));
    if (times.some((time, i) => time !== '' && parsed[i] === null) || parseClock(expected) === null) { setError('Preencha os horários no formato hh:mm.'); return; }
    const shift: Shift = { times: parsed as Shift['times'], expected: parseClock(expected)!, holiday };
    const invalid = shiftError(shift);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try { await onSave(shift, off); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  return <Modal title={`Ponto · ${date.slice(8)}/${date.slice(5, 7)}`} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit}><fieldset className="form-fields" disabled={busy}>
    {future && <p className="field-hint">Planeje o tipo de dia e a jornada. Os horários realizados podem ser registrados a partir desta data.</p>}
    <div className="time-grid">{['Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2'].map((label, i) => <label key={label}>{label}<input type="time" disabled={future} aria-label={label} value={times[i]} onChange={e => setTimes(times.map((time, index) => index === i ? e.target.value : time))} /></label>)}</div>
    <p className="field-hint">Use o segundo período depois do intervalo. Horários em ordem, dentro do mesmo dia.</p>
    <label className="checkbox-row"><input type="checkbox" checked={off} onChange={e => setOff(e.target.checked)} />Dia de folga</label>
    <label className="checkbox-row"><input type="checkbox" checked={holiday} onChange={e => { setHoliday(e.target.checked); setExpected(clockInput(expectedHours(date, month.hours, e.target.checked))); }} />Feriado</label>
    <label className="time-field">Jornada prevista<input type="time" required disabled={off} value={off ? '00:00' : expected} onChange={e => setExpected(e.target.value)} /></label>
    {off && <p className="field-hint">Também exclui o dia das metas de venda. Horas trabalhadas na folga contam como extras.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button full-width form-submit" type="submit">{busy ? 'Salvando…' : 'Salvar ponto'}</button>
    {initial && <button className="text-button full-width" type="button" onClick={async () => { setBusy(true); try { await onSave(null, off); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover.'); } finally { setBusy(false); } }}>Limpar ponto deste dia</button>}
  </fieldset></form></Modal>;
}

function HoursEditor({ month, onClose, onSave }: { month: Month; onClose: () => void; onSave: (hours: Month['hours']) => Promise<void> }) {
  const [values, setValues] = useState({ regular: clockInput(month.hours.regular), sunday: clockInput(month.hours.sunday), holiday: clockInput(month.hours.holiday) });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title="Jornadas do mês" onClose={() => { if (!busy) onClose(); }}><form onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    const hours = { regular: parseClock(values.regular), sunday: parseClock(values.sunday), holiday: parseClock(values.holiday) };
    if (Object.values(hours).some(v => v === null)) { setError('Preencha as três jornadas.'); return; }
    setBusy(true); setError(''); try { await onSave(hours as Month['hours']); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }}><fieldset disabled={busy} className="form-fields"><p className="dialog-copy">Aplicadas aos novos registros deste mês. Os pontos já registrados mantêm sua jornada prevista.</p>
    {(['regular', 'sunday', 'holiday'] as const).map((key, i) => <label className="time-field" key={key}>{['Segunda a sábado', 'Domingos', 'Feriados'][i]}<input type="time" required value={values[key]} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>)}
    {error && <p className="form-error" role="alert">{error}</p>}<button className="button full-width form-submit">{busy ? 'Salvando…' : 'Salvar jornadas'}</button>
  </fieldset></form></Modal>;
}
