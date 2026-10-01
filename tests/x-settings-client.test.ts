import { afterEach, describe, expect, it, vi } from 'vitest';
import { getXSettings, getXResult, saveXSettings } from '../src/lib/x-api';
const settings = { configured: true, testedAt: '2026-10-01T00:00:00Z', testError: null, task: null };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
describe('X 配置客户端协议', () => {
  it('html_200_is_backend_unavailable', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>静态页面</html>', { headers: { 'content-type': 'text/html' } }));
    await expect(getXSettings()).rejects.toThrow('当前部署未接入配置后台');
  });
  it('rejects_invalid_reply_structure', async () => {
    vi.stubGlobal('fetch', async () => json({ ok: true, data: { configured: 'yes' } }));
    await expect(getXSettings()).rejects.toThrow('后台返回的数据格式不完整');
    vi.stubGlobal('fetch', async () => json({ ok: true, data: { task: null, lastSuccessAt: null, accounts: [{ posts: 'wrong' }] } }));
    await expect(getXResult()).rejects.toThrow('后台返回的数据格式不完整');
  });
  it('mutation_sends_json_and_credentials', async () => {
    const fetcher = vi.fn(async () => json({ ok: true, data: settings })); vi.stubGlobal('fetch', fetcher);
    await saveXSettings('sample-secret');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ token: 'sample-secret' }) });
  });
  it('does_not_return_saved_token', async () => {
    vi.stubGlobal('fetch', async () => json({ ok: true, data: { ...settings, token: 'sample-secret' } }));
    expect(JSON.stringify(await getXSettings())).not.toContain('sample-secret');
  });
});
