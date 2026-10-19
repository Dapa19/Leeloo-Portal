let csrfToken = '';

export function setCsrfToken(token: string) { csrfToken = token; }
export function getCsrfToken() { return csrfToken; }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? 'Something went wrong. Please try again.');
  return payload.data as T;
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export const fileUrl = (id: string, inline = false) => `/api/files/${id}/download${inline ? '?inline=1' : ''}`;
