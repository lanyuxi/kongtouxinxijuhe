import { describe, expect, it, vi } from 'vitest';
import { createXClient, uniqueTargets } from '../scripts/api/x-client';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function clientWith(...responses: Response[]) {
  const fetcher = vi.fn(async () => responses.shift()!);
  return { client: createXClient(fetcher as typeof fetch), fetcher };
}
const user = () => json({ data: { id: '123', username: 'demo' } });
describe('真实 X 读取检测', () => {
  it('rejects_user_success_with_posts_failure', async () => {
    const { client } = clientWith(user(), json({ detail: 'sample-secret' }, 403));
    await expect(client.test('sample-secret', 'demo')).rejects.toMatchObject({ failure: { code: 'forbidden' } });
  });
  it('rejects_numeric_user_ids_in_success_responses', async () => {
    const { client } = clientWith(json({ data: { id: 123, username: 'demo' } }), json({ data: [] }));
    await expect(client.test('token', 'demo')).rejects.toMatchObject({ failure: { code: 'invalid_response' } });
  });
  it('rejects_explicit_null_posts_instead_of_treating_them_as_empty', async () => {
    await expect(clientWith(user(), json({ data: null, meta: { result_count: 0 } })).client.test('token', 'demo')).rejects.toMatchObject({ failure: { code: 'invalid_response' } });
  });
  it('empty_valid_posts_passes_but_malformed_200_fails', async () => {
    await expect(clientWith(user(), json({ meta: { result_count: 0 } })).client.test('token', 'demo')).resolves.toBeUndefined();
    for (const response of [json({}), json({ data: [{ id: '1' }] }), new Response('<html>')]) {
      await expect(clientWith(user(), response).client.test('token', 'demo')).rejects.toMatchObject({ failure: { code: 'invalid_response' } });
    }
  });
  it.each([[401, 'invalid_token'], [402, 'credits'], [429, 'rate_limit'], [404, 'not_found'], [503, 'upstream']])('sanitizes HTTP %s as %s', async (status, code) => {
    const { client } = clientWith(json({ detail: 'sample-secret' }, status as number));
    try { await client.test('sample-secret', 'demo'); throw new Error('unexpected success'); }
    catch (e) { expect(e).toMatchObject({ failure: { code } }); expect(String(e)).not.toContain('sample-secret'); }
  });
  it('enforces_fixed_host_reads_post_content_and_labels_candidates', async () => {
    const { client, fetcher } = clientWith(user(), json({ data: [{ id: '456', text: 'Airdrop snapshot now', created_at: '2026-10-01T00:00:00Z' }] }));
    const result = await client.readAccount('token', 'demo');
    expect(result.posts[0]).toMatchObject({ url: 'https://x.com/demo/status/456', airdropSignal: true, text: 'Airdrop snapshot now' });
    expect(String(fetcher.mock.calls[1][0])).toContain('max_results=10');
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('post.fields')).toBe('created_at');
    for (const call of fetcher.mock.calls) {
      expect(new URL(String(call[0])).origin).toBe('https://api.x.com');
      expect(call[1]).toMatchObject({ redirect: 'error' });
    }
  });
  it('distinguishes_timeout_and_network_errors', async () => {
    for (const [name, code] of [['TimeoutError', 'timeout'], ['TypeError', 'network']]) {
      const fetcher = vi.fn(async () => { const error = new Error('sample-secret'); error.name = name; throw error; });
      await expect(createXClient(fetcher).test('token', 'demo')).rejects.toMatchObject({ failure: { code } });
    }
  });
  it('deduplicates_handles_and_limits_to_40_accounts', () => {
    const targets = [{ handle: 'DEMO', slugs: ['a'] }, { handle: 'demo', slugs: ['b'] }, ...Array.from({ length: 50 }, (_, i) => ({ handle: `user${i}`, slugs: [`p${i}`] }))];
    const result = uniqueTargets(targets);
    expect(result).toHaveLength(40); expect(result[0].slugs).toEqual(['a', 'b']);
  });
});
