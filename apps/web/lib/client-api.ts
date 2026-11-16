/** Chamadas feitas pelo navegador direto à API (CORS liberado para WEB_ORIGIN). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type CorpoErro = { message?: unknown; erros?: Record<string, unknown> };

function mensagemDeErro(body: CorpoErro | null | undefined, status: number): string {
  const msg = typeof body?.message === 'string' ? body.message : `Erro ${status}`;
  const erros = body?.erros;
  if (!erros || typeof erros !== 'object') return msg;
  const detalhes = Object.entries(erros)
    .map(([campo, valor]) => `${campo}: ${Array.isArray(valor) ? valor.join(', ') : String(valor)}`)
    .join('; ');
  return detalhes ? `${msg} (${detalhes})` : msg;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('Não foi possível falar com a API. Confirme que ela está rodando.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as CorpoErro | null;
    throw new Error(mensagemDeErro(body, res.status));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

/** Para respostas binárias (ex.: amostra de voz). */
export async function fetchBlob(path: string, method: 'GET' | 'POST' = 'GET'): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method });
  } catch {
    throw new Error('Não foi possível falar com a API. Confirme que ela está rodando.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as CorpoErro | null;
    throw new Error(mensagemDeErro(body, res.status));
  }
  return res.blob();
}
