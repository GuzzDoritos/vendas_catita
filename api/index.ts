import type { IncomingMessage, ServerResponse } from 'node:http';
import { authConfig, createSession, passwordMatches, sameOrigin, sessionCookie, sessionFromCookie, validSession } from '../server/auth.ts';
import { allowLogin, readSnapshot, writeSnapshot } from '../server/database.ts';
import { todayKey, validateData } from '../src/domain.ts';

type Request = IncomingMessage & { body?: unknown };
const MAX_BODY = 1_000_000;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new Error('INVALID_BODY');
  let body = req.body;
  if (body === undefined) {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY) throw new Error('INVALID_BODY');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) throw new Error('INVALID_BODY');
    body = JSON.parse(body);
  } else if (Buffer.byteLength(JSON.stringify(body) ?? '') > MAX_BODY) throw new Error('INVALID_BODY');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_BODY');
  return body as Record<string, unknown>;
}

export default async function handler(req: Request, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status: number, body: unknown) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  const action = new URL(req.url ?? '/', 'http://localhost').searchParams.get('action');
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  try {
    if (!['GET', 'POST', 'PUT'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, POST, PUT'); return send(405, { error: 'Método não permitido.' });
    }
    if (req.method !== 'GET' && !sameOrigin(req.headers.origin, req.headers.host, secure)) {
      return send(403, { error: 'Origem da solicitação não permitida.' });
    }
    const { password, secret } = authConfig();
    const authenticated = validSession(sessionFromCookie(req.headers.cookie), password, secret);
    if (action === 'session' && req.method === 'GET') return send(200, { authenticated });
    if (action === 'login' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { return send(400, { error: 'Solicitação inválida.' }); }
      if (typeof body.password !== 'string' || body.password.length > 1024) return send(400, { error: 'Informe uma senha válida.' });
      if (!await allowLogin()) {
        res.setHeader('Retry-After', '900'); return send(429, { error: 'Muitas tentativas. Aguarde até 15 minutos e tente novamente.' });
      }
      if (!passwordMatches(body.password, password)) return send(401, { error: 'Senha incorreta.' });
      res.setHeader('Set-Cookie', sessionCookie(createSession(password, secret), secure));
      return send(200, { authenticated: true });
    }
    if (action === 'logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', sessionCookie('', secure)); return send(200, { authenticated: false });
    }
    if (!authenticated) return send(401, { error: 'Sua sessão expirou. Entre novamente.' });
    if (action === 'data' && req.method === 'GET') return send(200, await readSnapshot());
    if (action === 'data' && req.method === 'PUT') {
      let data, revision;
      try {
        const body = await readBody(req);
        if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) throw new Error('Revision');
        revision = body.revision as number;
        data = validateData(body.data);
        const today = todayKey();
        for (const month of Object.values(data.months)) for (const [date, day] of Object.entries(month.days)) {
          if (date > today && (day.amount !== null || day.closed)) throw new Error('Future entry');
        }
      } catch { return send(400, { error: 'Dados inválidos. Confira valores, datas e o formato do backup. Vendas futuras não são permitidas.' }); }
      const nextRevision = await writeSnapshot(data, revision);
      if (nextRevision === null) return send(409, { error: 'Os dados mudaram em outro aparelho. Anote o valor digitado, feche esta janela e clique em Atualizar antes de tentar novamente.' });
      return send(200, { revision: nextRevision });
    }
    return send(404, { error: 'Operação não encontrada.' });
  } catch {
    // Do not return database errors or log connection strings/passwords.
    return send(503, { error: 'Serviço indisponível. Confira a conexão ou a configuração do servidor e tente novamente.' });
  }
}
