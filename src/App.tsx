import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ALL_GOALS, STORAGE_KEY, calculate, createMonth, money, moneyInput, monthDates, parseMoney, parseProd, prodLabel, shiftMonth, todayKey, validateData } from './domain';
import type { Data, Day, Month } from './domain';
import { ApiError, errorMessage, loadData, request } from './api';
import Login from './Login';
import Modal from './Modal';
import ShiftControl from './ShiftControl';
import TrendChart from './TrendChart';

const monthLabel = (key: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`));
const dateLabel = (key: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00`));
const weekday = (key: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${key}T12:00:00`)).replace('.', '');

export default function App() {
  const [snapshot, setSnapshot] = useState<{ data: Data; revision: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  async function open() {
    setStatus('loading');
    try { setSnapshot(await loadData()); setStatus('ready'); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) setStatus('login');
      else { setError(errorMessage(err)); setStatus('error'); }
    }
  }
  useEffect(() => { void open(); }, []);
  if (status === 'login') return <Login onLogin={() => void open()} />;
  if (status === 'loading') return <main className="loading-page" role="status">Carregando suas vendas…</main>;
  if (status === 'error') return <main className="loading-page"><p role="alert">{error}</p><button className="button form-submit" onClick={() => void open()}>Tentar novamente</button></main>;
  return <Dashboard initial={snapshot!} onLogout={async () => { await request('logout', 'POST'); setSnapshot(null); setStatus('login'); }} />;
}

function Dashboard({ initial, onLogout }: { initial: { data: Data; revision: number }; onLogout: () => Promise<void> }) {
  const [data, setData] = useState(initial.data);
  const revision = useRef(initial.revision);
  const saveLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [reauth, setReauth] = useState(false);
  const [today, setToday] = useState(todayKey);
  const [selected, setSelected] = useState(() => todayKey().slice(0, 7));
  const [editor, setEditor] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [backup, setBackup] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState<'sales' | 'shifts'>('sales');
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
    return () => { clearInterval(interval); window.removeEventListener('focus', update); };
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);

  async function save(next: Data): Promise<boolean> {
    if (saveLock.current) return false;
    if (storageError) throw new Error(storageError);
    saveLock.current = true; setSaving(true);
    try {
      const result = await request<{ revision: number }>('data', 'PUT', { data: next, revision: revision.current });
      revision.current = result.revision;
      setData(next); setNotice('Salvo.'); return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setReauth(true);
      if (err instanceof ApiError && err.status === 409) setStorageError(err.message);
      throw new Error(errorMessage(err));
    } finally { saveLock.current = false; setSaving(false); }
  }
  function saveMonth(next: Month) { return save({ ...data, months: { ...data.months, [selected]: next } }); }
  async function refresh() {
    if (saveLock.current) return;
    setSaving(true); saveLock.current = true;
    try {
      const snapshot = await loadData(); setData(snapshot.data); revision.current = snapshot.revision;
      setStorageError(''); setEditor(null); setSettings(false); setPendingImport(null); setNotice('Dados atualizados.');
    } catch (err) { if (err instanceof ApiError && err.status === 401) setReauth(true); setNotice(errorMessage(err)); }
    finally { setSaving(false); saveLock.current = false; }
  }
  function download(raw: string, name: string) {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportBackup() {
    download(JSON.stringify(data, null, 2), `catita-backup-${today}.json`);
  }

  const filteredDates = monthDates(selected).filter(date => filter === 'all' || (filter === 'off' ? month.days[date].off : date < today && !month.days[date].off && month.days[date].amount === null));
  return <>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSelected(today.slice(0, 7)); }}>catita<span>vendas & metas</span></a>
      <div className="header-actions"><button className="text-button" disabled={saving} onClick={() => void refresh()}>Atualizar</button><button className="text-button" onClick={() => { setBackup(true); setBackupError(''); }}>Backup</button><button className="text-button" disabled={saving} onClick={async () => { try { await onLogout(); } catch (err) { setNotice(errorMessage(err)); } }}>Sair</button></div>
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

      {storageError && <div className="error-banner" role="alert">{storageError} <button onClick={exportBackup}>Exportar cópia atual</button> <button disabled={saving} onClick={() => void refresh()}>Atualizar dados</button></div>}

      <nav className="view-tabs" aria-label="Seção do mês"><button aria-pressed={tab === 'sales'} onClick={() => setTab('sales')}>Vendas</button><button aria-pressed={tab === 'shifts'} onClick={() => setTab('shifts')}>Ponto</button></nav>
      {tab === 'shifts' ? <ShiftControl key={selected} month={month} monthKey={selected} today={today} disabled={saving || !!storageError} onSave={saveMonth} /> : <>
      <section className="overview" aria-label="Resumo do mês">
        <div className="overview-main"><p className="eyebrow">{isPast ? 'TOTAL VENDIDO' : 'VENDIDO NO MÊS'}</p><p className="total">{money(summary.total)}</p><p className="overview-note">{isPast ? 'Mês encerrado' : isCurrent ? `Até ${dateLabel(today)}` : 'Planejamento do mês'}</p></div>
        <div className="overview-side"><div className="workday-count"><strong>{summary.remaining}</strong><span>dias de trabalho<br />{isPast ? 'restantes' : 'pela frente'}</span></div>
          {isCurrent && <button className="button button-light" disabled={!!storageError || saving} onClick={() => setEditor(today)}>{todayDay.amount === null ? 'Registrar venda de hoje' : 'Editar venda de hoje'}<span aria-hidden="true">↗</span></button>}
          {isCurrent && <p className="today-note">{todayDay.off ? 'Hoje é dia de folga.' : todayDay.closed ? 'Hoje já está encerrado.' : 'Hoje está incluído nos dias restantes.'}</p>}
        </div>
      </section>

      <section className="goals-section" aria-labelledby="goals-title">
        <div className="section-heading"><div><h2 id="goals-title">Suas metas</h2><p>{isPast ? 'O resultado de cada faixa neste mês.' : 'Quanto falta e o ritmo necessário para chegar lá.'}</p></div><button className="text-button" disabled={!!storageError || saving} onClick={() => setSettings(true)}>{configured ? 'Editar metas' : 'Definir metas'}</button></div>
        {!configured && <div className="setup-note">Defina as metas do mês e marque suas folgas na lista abaixo.</div>}
        <div className="goals-table">
          <div className="goal-table-heading" aria-hidden="true"><span>FAIXA / PROGRESSO</span><span>FALTA VENDER</span><span>POR DIA RESTANTE</span></div>
          {[summary.impulso, ...summary.goals].map((goal, i) => <div className={`goal-row goal-${i}`} key={ALL_GOALS[i]}>
            <div className="goal-name"><div className="goal-title"><h3>{ALL_GOALS[i]}</h3><span>{goal.target ? `${Math.floor(goal.percent)}%` : '—'}</span></div><p>{goal.target ? `de ${money(goal.target)}` : 'Meta não definida'}</p><div className="progress-track" role="progressbar" aria-label={`Progresso ${ALL_GOALS[i]}`} aria-valuenow={Math.min(100, Math.floor(goal.percent))} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, goal.percent)}%` }} /></div></div>
            <div className="goal-gap"><span className="mobile-label">Falta vender</span><strong>{goal.target ? money(goal.gap) : '—'}</strong>{goal.target > 0 && goal.gap === 0 && <small>Meta atingida</small>}</div>
            <div className="goal-daily"><span className="mobile-label">Por dia restante</span><strong>{goal.daily !== null ? money(goal.daily) : '—'}</strong>{goal.target > 0 && goal.daily === null && <small>Sem dias restantes</small>}</div>
          </div>)}
        </div>
        {isCurrent && !todayDay.off && !todayDay.closed && (todayDay.amount ?? 0) > 0 && <p className="calculation-note">Média adicional a vender, incluindo o restante de hoje.</p>}
        {summary.missing > 0 && <p className="missing-note">{summary.missing} {summary.missing === 1 ? 'dia anterior sem lançamento' : 'dias anteriores sem lançamento'}. O acumulado considera apenas os valores registrados. <button onClick={() => setFilter('missing')}>Ver dias</button></p>}
      </section>

      <div className="prod-summary"><span>Prod médio do mês</span><strong>{summary.prodAverage === null ? '—' : prodLabel(summary.prodAverage)}</strong><small>{summary.prodCount} dias registrados</small></div>
      <TrendChart month={month} today={today} />
      <section className="days-section" aria-labelledby="days-title">
        <div className="section-heading"><div><h2 id="days-title">Dia a dia</h2><p>{summary.workdays} dias de trabalho · {monthDates(selected).length - summary.workdays} folgas no mês</p></div><label className="filter-label"><span className="sr-only">Filtrar dias</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos os dias</option><option value="missing">Sem lançamento</option><option value="off">Folgas</option></select></label></div>
        <div className="days-list">
          {filteredDates.length === 0 && <p className="empty-list">Nenhum dia neste filtro.</p>}
          {filteredDates.map(date => {
            const day = month.days[date]; const current = date === today; const future = date > today;
            return <div key={date} className={`day-row ${current ? 'is-today' : ''} ${day.off ? 'is-off' : ''}`}>
              <div className="day-date"><strong>{date.slice(8)}</strong><span>{weekday(date)}</span></div>
              <div className="day-description"><strong>{current ? 'Hoje' : day.off ? 'Folga' : 'Trabalho'}</strong><span>{current && day.off ? 'Folga' : day.closed ? 'Encerrado' : day.off ? 'Fora da média diária' : future ? 'Planejado' : day.amount === null ? 'Sem lançamento' : current ? 'Em andamento' : 'Registrado'}</span></div>
              <button className="day-value" disabled={!!storageError || saving} aria-label={`${dateLabel(date)}: editar venda e Prod`} onClick={() => setEditor(date)}>{day.amount !== null ? money(day.amount) : future || day.off ? '—' : 'Lançar valor'}<small>Prod {day.prod === null ? '—' : prodLabel(day.prod)}</small></button>
              <button className={`off-toggle ${day.off ? 'active' : ''}`} disabled={!!storageError || saving} aria-label={`Folga em ${dateLabel(date)}`} aria-pressed={day.off} onClick={async () => {
                try { if (await saveMonth({ ...month, days: { ...month.days, [date]: { ...day, off: !day.off } } }) && !day.off && (day.amount ?? 0) > 0) setNotice('Folga marcada. A venda continua no acumulado.'); }
                catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
              }}>Folga</button>
            </div>;
          })}
        </div>
      </section>
      </>}
      <footer><span role="status">{saving ? 'Salvando…' : 'Dados salvos na nuvem.'}</span><button onClick={() => { setBackup(true); setBackupError(''); }}>Exportar um backup</button></footer>
    </main>
    <div className={`toast ${notice ? 'visible' : ''}`} role="status">{notice}</div>

    {editor && <DayEditor key={editor} date={editor} today={today} day={month.days[editor]} onClose={() => setEditor(null)} onSave={async day => { const saved = await saveMonth({ ...month, days: { ...month.days, [editor]: day } }); if (saved) setEditor(null); return saved; }} />}
    {settings && <GoalEditor goals={month.goals} impulso={month.impulso} label={monthLabel(selected)} onClose={() => setSettings(false)} onSave={async (goals, impulso) => { const saved = await saveMonth({ ...month, goals, impulso }); if (saved) setSettings(false); return saved; }} />}
    {backup && <Modal title="Seus dados" onClose={() => { setBackup(false); setPendingImport(null); }}>
      <p className="dialog-copy">As vendas ficam salvas na nuvem. Exporte uma cópia ou importe os dados da versão anterior.</p>
      <button className="button full-width" onClick={exportBackup}>Exportar backup JSON</button>
      <div className="restore-section"><h3>Restaurar backup</h3><p>Escolha um arquivo exportado pelo Catita.</p><button className="text-button" disabled={saving} onClick={() => {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) throw new Error('Nenhum dado da versão anterior neste navegador.'); setPendingImport(validateData(JSON.parse(raw))); setBackupError(''); }
        catch (err) { setBackupError(err instanceof Error ? err.message : 'Não foi possível ler os dados locais.'); }
      }}>Buscar dados da versão anterior</button><input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Arquivo de backup" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          if (file.size > 900_000) throw new Error('O arquivo ultrapassa 900 KB.');
          const imported = validateData(JSON.parse(await file.text())); setPendingImport(imported); setBackupError('');
        } catch (error) { setBackupError(error instanceof Error ? error.message : 'Arquivo inválido.'); setPendingImport(null); }
        e.target.value = '';
      }} /><button className="button button-outline full-width" onClick={() => fileRef.current?.click()}>Escolher arquivo</button></div>
      {pendingImport && <div className="import-preview"><strong>{Object.keys(pendingImport.months).length} mês(es) no backup</strong><p>A restauração substituirá todos os dados na nuvem. Exporte uma cópia antes de continuar.</p><button className="button full-width" disabled={saving || !!storageError} onClick={async () => { try { if (await save(pendingImport)) { setBackup(false); setPendingImport(null); setNotice('Backup restaurado.'); } } catch (err) { setBackupError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } }}>{saving ? 'Restaurando…' : 'Substituir dados e restaurar'}</button></div>}
      {backupError && <p className="form-error" role="alert">{backupError}</p>}
    </Modal>}
    {reauth && <Modal title="Entre novamente" onClose={() => setReauth(false)}><Login onLogin={() => { setReauth(false); setNotice('Sessão renovada. Você pode salvar novamente.'); }} /></Modal>}
  </>;
}

function DayEditor({ date, today, day, onClose, onSave }: { date: string; today: string; day: Day; onClose: () => void; onSave: (day: Day) => Promise<boolean> }) {
  const [value, setValue] = useState(day.amount === null ? '' : moneyInput(day.amount));
  const [prodValue, setProdValue] = useState(day.prod === null ? '' : moneyInput(day.prod));
  const [off, setOff] = useState(day.off);
  const [closed, setClosed] = useState(day.closed);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const future = date > today;
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    const amount = value.trim() === '' ? null : parseMoney(value);
    const prod = prodValue.trim() === '' ? null : parseProd(prodValue);
    if (prodValue.trim() !== '' && prod === null) { setError('Informe um Prod válido, como 2,33, com até duas casas decimais.'); return; }
    if (value.trim() !== '' && amount === null) { setError('Informe um valor válido, como 1.250,50.'); return; }
    if (closed && amount === null && date === today) { setError('Informe o total do dia, mesmo que seja zero, para encerrar.'); return; }
    setBusy(true); setError('');
    try { await onSave({ off, amount: future ? day.amount : amount, prod: future ? day.prod : prod, closed: future || amount === null ? false : closed }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <Modal title={dateLabel(date)} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={busy} className="form-fields">
    {!future ? <><label className="field-label" htmlFor="daily-amount">Total vendido no dia</label><div className="money-field"><span>R$</span><input autoFocus id="daily-amount" inputMode="decimal" placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} /></div><p className="field-hint">O valor substitui o total anterior. Deixe vazio para remover o lançamento.</p></> : <p className="dialog-copy">Planeje sua folga. As vendas poderão ser registradas a partir desta data.</p>}
    {!future && <div className="goal-field"><label className="field-label" htmlFor="daily-prod">Prod</label><div className="money-field"><input id="daily-prod" inputMode="decimal" placeholder="2,33" value={prodValue} onChange={e => setProdValue(e.target.value)} /></div><p className="field-hint">Opcional. A média usa apenas os valores preenchidos.</p></div>}
    <label className="checkbox-row"><input type="checkbox" checked={off} onChange={e => setOff(e.target.checked)} /><span>Dia de folga</span></label>
    {date === today && <label className="checkbox-row"><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} /><span>Encerrar hoje<small>Distribuir o saldo apenas entre os próximos dias.</small></span></label>}
    {off && (parseMoney(value) ?? 0) > 0 && <p className="field-hint">A venda será mantida no acumulado, mesmo na folga.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button full-width form-submit" type="submit">{busy ? 'Salvando…' : 'Salvar dia'}</button>
  </fieldset></form></Modal>;
}

function GoalEditor({ goals, impulso, label, onClose, onSave }: { goals: Month['goals']; impulso: number | null; label: string; onClose: () => void; onSave: (goals: Month['goals'], impulso: number | null) => Promise<boolean> }) {
  const [values, setValues] = useState([impulso, ...goals].map(v => v ? moneyInput(v) : ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; const parsed = values.map(parseMoney);
    if (parsed.slice(1).some(v => v === null || v <= 0) || (values[0].trim() !== '' && (parsed[0] === null || parsed[0] <= 0))) { setError('Informe metas positivas. Impulso pode ficar vazio se não se aplicar ao mês.'); return; }
    const next = parsed.slice(1) as Month['goals'];
    if (next[0] > next[1] || next[1] > next[2] || (parsed[0] !== null && parsed[0] > next[0])) { setError('Use valores em ordem: Impulso, Gatilho, Acelera e Incrível.'); return; }
    setBusy(true); setError('');
    try { await onSave(next, parsed[0]); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <Modal title="Metas do mês" onClose={() => { if (!busy) onClose(); }}><p className="dialog-copy capitalize">{label}</p><form onSubmit={submit}><fieldset disabled={busy} className="form-fields">
    {ALL_GOALS.map((name, i) => <div className="goal-field" key={name}><label className="field-label" htmlFor={`goal-${i}`}>{name}{i === 0 ? ' (opcional)' : ''}</label><div className="money-field"><span>R$</span><input id={`goal-${i}`} autoFocus={i === 0} inputMode="decimal" placeholder="0,00" value={values[i]} onChange={e => setValues(values.map((v, index) => index === i ? e.target.value : v))} /></div></div>)}
    {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button full-width form-submit">{busy ? 'Salvando…' : 'Salvar metas'}</button>
  </fieldset></form></Modal>;
}
