import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage, request } from './api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await request('login', 'POST', { password }); setPassword(''); onLogin(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><div className="login-panel">
    <span className="brand">catita</span><p className="eyebrow">VENDAS & METAS</p>
    <h1>Seu mês começa aqui.</h1>
    <form onSubmit={submit}>
      <label className="field-label" htmlFor="password">Sua senha</label>
      <input className="password-input" id="password" type="password" autoComplete="current-password" autoFocus required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button full-width form-submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </div></main>;
}
