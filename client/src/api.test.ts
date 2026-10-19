import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setCsrfToken } from './api';

describe('API client', () => {
  afterEach(() => { vi.restoreAllMocks(); setCsrfToken(''); });

  it('sends the server session cookie and CSRF token without browser storage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { updated: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    setCsrfToken('csrf-for-this-session');
    await api('/projects/abc', { method: 'PATCH', body: JSON.stringify({ name: 'Updated' }) });
    const [, request] = fetchMock.mock.calls[0]!;
    expect(request?.credentials).toBe('include');
    expect(new Headers(request?.headers).get('X-CSRF-Token')).toBe('csrf-for-this-session');
    expect(new Headers(request?.headers).get('Content-Type')).toBe('application/json');
  });

  it('leaves multipart boundaries to the browser when uploading files', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { id: 'version' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const body = new FormData(); body.set('notes', 'First pass');
    await api('/deliverables/abc/versions', { method: 'POST', body });
    const [, request] = fetchMock.mock.calls[0]!;
    expect(new Headers(request?.headers).has('Content-Type')).toBe(false);
  });

  it('shows validation and authorization errors returned by the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Project not found.' } }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(api('/projects/unknown')).rejects.toThrow('Project not found.');
  });
});
