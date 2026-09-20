import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { GOALS, STORAGE_KEY, calculate, createMonth, emptyData, money, moneyInput, monthDates, parseMoney, shiftMonth, todayKey, validateData } from './domain';
import type { Data, Day, Month } from './domain';

const monthLabel = (key: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`));
const dateLabel = (key: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00`));
const weekday = (key: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${key}T12:00:00`)).replace('.', '');

function readData(): { data: Data; error: string } {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return { data: value ? validateData(JSON.parse(value)) : emptyData(), error: '' };
  } catch {
    return { data: emptyData(), error: 'Não foi possível ler os dados salvos. Exporte os dados originais antes de restaurar um backup. Seus dados não foram apagados.' };
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} className="dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="close-button" aria-label="Fechar" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

export default function App() {
  const [initial] = useState(readData);
  const [data, setData] = useState(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [today, setToday] = useState(todayKey);
  const [selected, setSelected] = useState(() => todayKey().slice(0, 7));
  const [editor, setEditor] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [backup, setBackup] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [pendingImport, setPendingImport] = useState<Data | null>(null);
  const [backupError, setBackupError] = useState('');
  const month = data.months[selected] ?? createMonth(selected);
  const summary = calculate(month, today);
  const isCurrent = selected === today.slice(0, 7);
  const isPast = selected < today.slice(0, 7);
  const configured = month.goals.every(v => v > 0);
  const todayDay = month.days[today];
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setToday(todayKey());
    const interval = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    const refresh = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const next = readData(); setData(next.data); setStorageError(next.error);
        setEditor(null); setSettings(false); setPendingImport(null);
        setNotice('Dados atualizados em outra aba.');
      }
    };
    window.addEventListener('storage', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', update); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);

  function save(next: Data, restoring = false): boolean {
    if (storageError && !restoring) { setNotice('Restaure um backup para voltar a editar.'); return false; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setData(next); setStorageError(''); setNotice('Salvo neste navegador.'); return true;
    } catch {
      setNotice('Não foi possível salvar. Verifique o espaço ou as permissões do navegador.'); return false;
    }
  }
  function saveMonth(next: Month) { return save({ ...data, months: { ...data.months, [selected]: next } }); }
  function download(raw: string, name: string) {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportBackup() {
    try { download(storageError ? localStorage.getItem(STORAGE_KEY) ?? '{}' : JSON.stringify(data, null, 2), `catita-backup-${today}.json`); }
    catch { setBackupError('Não foi possível acessar os dados originais neste navegador.'); }
  }

  const filteredDates = monthDates(selected).filter(date => filter === 'all' || (filter === 'off' ? month.days[date].off : date < today && !month.days[date].off && month.days[date].amount === null));
  return <>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSelected(today.slice(0, 7)); }}>catita<span>vendas & metas</span></a>
      <button className="text-button" onClick={() => { setBackup(true); setBackupError(''); }}>Backup</button>
    </div></header>
    <main>
      <div className="page-heading">
        <div><p className="eyebrow">SEU MÊS, NO SEU RITMO</p><h1>Um dia de cada vez.</h1></div>
        <div className="month-switcher">
          <button aria-label="Mês anterior" disabled={selected === '1900-01'} onClick={() => setSelected(shiftMonth(selected, -1))}>‹</button>
          <label className="month-picker"><span>{monthLabel(selected)}</span><input aria-label="Selecionar mês" type="month" min="1900-01" max="2199-12" value={selected} onChange={e => { if (/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) setSelected(e.target.value); }} /></label>
          <button aria-label="Próximo mês" disabled={selected === '2199-12'} onClick={() => setSelected(shiftMonth(selected, 1))}>›</button>
        </div>
      </div>

      {storageError && <div className="error-banner" role="alert">{storageError} <button onClick={() => setBackup(true)}>Abrir backup</button></div>}

      <section className="overview" aria-label="Resumo do mês">
        <div className="overview-main"><p className="eyebrow">{isPast ? 'TOTAL VENDIDO' : 'VENDIDO NO MÊS'}</p><p className="total">{money(summary.total)}</p><p className="overview-note">{isPast ? 'Mês encerrado' : isCurrent ? `Até ${dateLabel(today)}` : 'Planejamento do mês'}</p></div>
        <div className="overview-side"><div className="workday-count"><strong>{summary.remaining}</strong><span>dias de trabalho<br />{isPast ? 'restantes' : 'pela frente'}</span></div>
          {isCurrent && <button className="button button-light" disabled={!!storageError} onClick={() => setEditor(today)}>{todayDay.amount === null ? 'Registrar venda de hoje' : 'Editar venda de hoje'}<span aria-hidden="true">↗</span></button>}
          {isCurrent && <p className="today-note">{todayDay.off ? 'Hoje é dia de folga.' : todayDay.closed ? 'Hoje já está encerrado.' : 'Hoje está incluído nos dias restantes.'}</p>}
        </div>
      </section>

      <section className="goals-section" aria-labelledby="goals-title">
        <div className="section-heading"><div><h2 id="goals-title">Suas metas</h2><p>{isPast ? 'O resultado de cada faixa neste mês.' : 'Quanto falta e o ritmo necessário para chegar lá.'}</p></div><button className="text-button" disabled={!!storageError} onClick={() => setSettings(true)}>{configured ? 'Editar metas' : 'Definir metas'}</button></div>
        {!configured && <div className="setup-note">Comece definindo as três metas do mês e marque suas folgas na lista abaixo.</div>}
        <div className="goals-table">
          <div className="goal-table-heading" aria-hidden="true"><span>FAIXA / PROGRESSO</span><span>FALTA VENDER</span><span>POR DIA RESTANTE</span></div>
          {summary.goals.map((goal, i) => <div className={`goal-row goal-${i}`} key={GOALS[i]}>
            <div className="goal-name"><div className="goal-title"><h3>{GOALS[i]}</h3><span>{goal.target ? `${Math.floor(goal.percent)}%` : '—'}</span></div><p>{goal.target ? `de ${money(goal.target)}` : 'Meta não definida'}</p><div className="progress-track" role="progressbar" aria-label={`Progresso ${GOALS[i]}`} aria-valuenow={Math.min(100, Math.floor(goal.percent))} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, goal.percent)}%` }} /></div></div>
            <div className="goal-gap"><span className="mobile-label">Falta vender</span><strong>{goal.target ? money(goal.gap) : '—'}</strong>{goal.target > 0 && goal.gap === 0 && <small>Meta atingida</small>}</div>
            <div className="goal-daily"><span className="mobile-label">Por dia restante</span><strong>{goal.daily !== null ? money(goal.daily) : '—'}</strong>{goal.target > 0 && goal.daily === null && <small>Sem dias restantes</small>}</div>
          </div>)}
        </div>
        {isCurrent && !todayDay.off && !todayDay.closed && (todayDay.amount ?? 0) > 0 && <p className="calculation-note">Média adicional a vender, incluindo o restante de hoje.</p>}
        {summary.missing > 0 && <p className="missing-note">{summary.missing} {summary.missing === 1 ? 'dia anterior sem lançamento' : 'dias anteriores sem lançamento'}. O acumulado considera apenas os valores registrados. <button onClick={() => setFilter('missing')}>Ver dias</button></p>}
      </section>

      <section className="days-section" aria-labelledby="days-title">
        <div className="section-heading"><div><h2 id="days-title">Dia a dia</h2><p>{summary.workdays} dias de trabalho · {monthDates(selected).length - summary.workdays} folgas no mês</p></div><label className="filter-label"><span className="sr-only">Filtrar dias</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos os dias</option><option value="missing">Sem lançamento</option><option value="off">Folgas</option></select></label></div>
        <div className="days-list">
          {filteredDates.length === 0 && <p className="empty-list">Nenhum dia neste filtro.</p>}
          {filteredDates.map(date => {
            const day = month.days[date]; const current = date === today; const future = date > today;
            return <div key={date} className={`day-row ${current ? 'is-today' : ''} ${day.off ? 'is-off' : ''}`}>
              <div className="day-date"><strong>{date.slice(8)}</strong><span>{weekday(date)}</span></div>
              <div className="day-description"><strong>{current ? 'Hoje' : day.off ? 'Folga' : 'Trabalho'}</strong><span>{current && day.off ? 'Folga' : day.closed ? 'Encerrado' : day.off ? 'Fora da média diária' : future ? 'Planejado' : day.amount === null ? 'Sem lançamento' : current ? 'Em andamento' : 'Registrado'}</span></div>
              <button className="day-value" disabled={!!storageError} aria-label={`${dateLabel(date)}: ${day.amount === null ? 'registrar venda' : `editar ${money(day.amount)}`}`} onClick={() => setEditor(date)}>{day.amount !== null ? money(day.amount) : future || day.off ? '—' : 'Lançar valor'}</button>
              <button className={`off-toggle ${day.off ? 'active' : ''}`} disabled={!!storageError} aria-label={`Folga em ${dateLabel(date)}`} aria-pressed={day.off} onClick={() => {
                if (saveMonth({ ...month, days: { ...month.days, [date]: { ...day, off: !day.off } } }) && !day.off && (day.amount ?? 0) > 0) setNotice('Folga marcada. A venda continua no acumulado.');
              }}>Folga</button>
            </div>;
          })}
        </div>
      </section>
      <footer><span>Salvo neste navegador.</span><button onClick={() => { setBackup(true); setBackupError(''); }}>Exportar um backup</button></footer>
    </main>
    <div className={`toast ${notice ? 'visible' : ''}`} role="status">{notice}</div>

    {editor && <DayEditor key={editor} date={editor} today={today} day={month.days[editor]} onClose={() => setEditor(null)} onSave={day => { const saved = saveMonth({ ...month, days: { ...month.days, [editor]: day } }); if (saved) setEditor(null); return saved; }} />}
    {settings && <GoalEditor goals={month.goals} label={monthLabel(selected)} onClose={() => setSettings(false)} onSave={goals => { const saved = saveMonth({ ...month, goals }); if (saved) setSettings(false); return saved; }} />}
    {backup && <Modal title="Seus dados" onClose={() => { setBackup(false); setPendingImport(null); }}>
      <p className="dialog-copy">As vendas ficam neste navegador. Guarde um backup para trocar de aparelho ou recuperar seus dados.</p>
      <button className="button full-width" onClick={exportBackup}>Exportar backup JSON</button>
      <div className="restore-section"><h3>Restaurar backup</h3><p>Escolha um arquivo exportado pelo Catita.</p><input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Arquivo de backup" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          if (file.size > 5_000_000) throw new Error('O arquivo ultrapassa 5 MB.');
          const imported = validateData(JSON.parse(await file.text())); setPendingImport(imported); setBackupError('');
        } catch (error) { setBackupError(error instanceof Error ? error.message : 'Arquivo inválido.'); setPendingImport(null); }
        e.target.value = '';
      }} /><button className="button button-outline full-width" onClick={() => fileRef.current?.click()}>Escolher arquivo</button></div>
      {pendingImport && <div className="import-preview"><strong>{Object.keys(pendingImport.months).length} mês(es) no backup</strong><p>A restauração substituirá todos os dados atuais. Exporte uma cópia antes de continuar.</p><button className="button full-width" onClick={() => { if (save(pendingImport, true)) { setBackup(false); setPendingImport(null); setNotice('Backup restaurado.'); } else setBackupError('Não foi possível salvar. Verifique o espaço e as permissões do navegador.'); }}>Substituir dados e restaurar</button></div>}
      {backupError && <p className="form-error" role="alert">{backupError}</p>}
    </Modal>}
  </>;
}

function DayEditor({ date, today, day, onClose, onSave }: { date: string; today: string; day: Day; onClose: () => void; onSave: (day: Day) => boolean }) {
  const [value, setValue] = useState(day.amount === null ? '' : moneyInput(day.amount));
  const [off, setOff] = useState(day.off);
  const [closed, setClosed] = useState(day.closed);
  const [error, setError] = useState('');
  const future = date > today;
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = value.trim() === '' ? null : parseMoney(value);
    if (value.trim() !== '' && amount === null) { setError('Informe um valor válido, como 1.250,50.'); return; }
    if (closed && amount === null && date === today) { setError('Informe o total do dia, mesmo que seja zero, para encerrar.'); return; }
    if (!onSave({ off, amount: future ? day.amount : amount, closed: future || amount === null ? false : closed })) setError('Não foi possível salvar. Verifique o espaço e as permissões do navegador.');
  }
  return <Modal title={dateLabel(date)} onClose={onClose}><form onSubmit={submit}>
    {!future ? <><label className="field-label" htmlFor="daily-amount">Total vendido no dia</label><div className="money-field"><span>R$</span><input autoFocus id="daily-amount" inputMode="decimal" placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} /></div><p className="field-hint">O valor substitui o total anterior. Deixe vazio para remover o lançamento.</p></> : <p className="dialog-copy">Planeje sua folga. As vendas poderão ser registradas a partir desta data.</p>}
    <label className="checkbox-row"><input type="checkbox" checked={off} onChange={e => setOff(e.target.checked)} /><span>Dia de folga</span></label>
    {date === today && <label className="checkbox-row"><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} /><span>Encerrar hoje<small>Distribuir o saldo apenas entre os próximos dias.</small></span></label>}
    {off && (parseMoney(value) ?? 0) > 0 && <p className="field-hint">A venda será mantida no acumulado, mesmo na folga.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button full-width form-submit" type="submit">Salvar dia</button>
  </form></Modal>;
}

function GoalEditor({ goals, label, onClose, onSave }: { goals: Month['goals']; label: string; onClose: () => void; onSave: (goals: Month['goals']) => boolean }) {
  const [values, setValues] = useState(goals.map(v => v ? moneyInput(v) : ''));
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault(); const parsed = values.map(parseMoney);
    if (parsed.some(v => v === null || v <= 0)) { setError('Preencha as três metas com valores maiores que zero.'); return; }
    const next = parsed as Month['goals'];
    if (next[0] > next[1] || next[1] > next[2]) { setError('Use valores em ordem: Gatilho, Acelera e Incrível.'); return; }
    if (!onSave(next)) setError('Não foi possível salvar. Verifique o espaço e as permissões do navegador.');
  }
  return <Modal title="Metas do mês" onClose={onClose}><p className="dialog-copy capitalize">{label}</p><form onSubmit={submit}>
    {GOALS.map((name, i) => <div className="goal-field" key={name}><label className="field-label" htmlFor={`goal-${i}`}>{name}</label><div className="money-field"><span>R$</span><input id={`goal-${i}`} autoFocus={i === 0} inputMode="decimal" placeholder="0,00" value={values[i]} onChange={e => setValues(values.map((v, index) => index === i ? e.target.value : v))} /></div></div>)}
    {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button full-width form-submit">Salvar metas</button>
  </form></Modal>;
}
