import type { Data } from './domain';
import { validateData } from './domain';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function request<T>(action: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api?action=${action}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error ?? 'Não foi possível concluir a operação.', response.status);
  return result as T;
}

export async function loadData() {
  const result = await request<{ data: Data; revision: number }>('data');
  return { data: validateData(result.data), revision: result.revision };
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Não foi possível conectar. Verifique a internet e tente novamente.';
}
