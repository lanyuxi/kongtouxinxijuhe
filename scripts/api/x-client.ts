import { buildHandleIndex, looksLikeAirdrop } from '../fetch/twitter';
import type { XFailure, XPost, XTarget } from '../../src/lib/x-api-types';

export class XApiError extends Error {
  constructor(public readonly failure: XFailure) { super(failure.message); }
}
export const failure = (code: XFailure['code'], message: string) => new XApiError({ code, message });
export const safeFailure = (error: unknown): XFailure => error instanceof XApiError ? error.failure : { code: 'upstream', message: '服务暂时无法完成操作，请稍后重试。' };
export interface XClient {
  readAccount(token: string, handle: string, signal?: AbortSignal): Promise<{ handle: string; posts: XPost[] }>;
  test(token: string, handle: string): Promise<void>;
}
export function uniqueTargets(targets: XTarget[]): XTarget[] {
  const map = new Map<string, XTarget>();
  for (const t of targets) {
    if (!/^[a-z0-9_]{1,15}$/i.test(t.handle)) continue;
    const handle = t.handle.toLowerCase(); const previous = map.get(handle);
    if (previous) previous.slugs = [...new Set([...previous.slugs, ...t.slugs])];
    else map.set(handle, { handle, slugs: [...t.slugs] });
  }
  return [...map.values()].slice(0, 40);
}
export function readTargets(): XTarget[] {
  return uniqueTargets(buildHandleIndex().map(t => ({ handle: t.handle, slugs: [t.slug] })));
}
function responseFailure(status: number, body: Record<string, unknown>): XApiError {
  const type = String(body.type ?? '');
  if (status === 402 || /credits-depleted|usage-capped|usage-cap-exceeded/i.test(type) || body.title === 'CreditsDepleted') return failure('credits', 'X API 可用额度不足或消费上限已达到，请在 X 控制台检查余额和消费上限。');
  if (status === 401) return failure('invalid_token', 'X 拒绝了访问凭据，请重新复制有效的 Bearer Token。');
  if (status === 403) return failure('forbidden', '此凭据没有读取该账号或推文的权限，请在 X 控制台检查应用访问权限。');
  if (status === 404) return failure('not_found', '用于检测的官方 X 账号暂未找到，请稍后重试。');
  if (status === 429) return failure('rate_limit', 'X API 请求过于频繁，请稍后再试。');
  return failure('upstream', `X API 暂时无法提供数据（HTTP ${status}），请稍后重试。`);
}
export function createXClient(fetcher: typeof fetch = fetch): XClient {
  const request = async (token: string, endpoint: string, signal?: AbortSignal): Promise<Record<string, any>> => {
    const timeout = AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await fetcher(`https://api.x.com/2${endpoint}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      if (timeout.aborted || (e as Error).name === 'TimeoutError') throw failure('timeout', '连接 X API 超时，请检查后台网络后重试。');
      if (signal?.aborted) throw failure('interrupted', '抓取任务已取消，请重新操作。');
      throw failure('network', '后台无法连接 X API，请检查网络后重试。');
    }
    let body: Record<string, any>;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) throw responseFailure(response.status, body ?? {});
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('invalid_response', 'X API 返回的数据格式不完整，请稍后重试。');
    if (Array.isArray(body.errors) && body.errors.length) throw responseFailure(Number(body.errors[0].status) || 502, body.errors[0]);
    return body;
  };
  const client: XClient = {
    async readAccount(token, handle, signal) {
      if (!/^[a-z0-9_]{1,15}$/i.test(handle)) throw failure('invalid_input', '官方账号格式无效。');
      const user = await request(token, `/users/by/username/${handle}`, signal);
      if (!user.data || typeof user.data.id !== 'string' || !/^\d+$/.test(user.data.id) || typeof user.data.username !== 'string') throw failure('invalid_response', 'X API 没有返回有效的账号信息。');
      const tweets = await request(token, `/users/${user.data.id}/tweets?max_results=10&post.fields=created_at&exclude=replies,retweets`, signal);
      const data = tweets.data === undefined && tweets.meta?.result_count === 0 ? [] : tweets.data;
      if (!Array.isArray(data) || data.length > 10 || data.some(t => !t || typeof t.id !== 'string' || !/^\d+$/.test(t.id) || typeof t.text !== 'string' || !t.text.trim())) throw failure('invalid_response', 'X API 返回的推文内容不完整。');
      return { handle, posts: data.map(t => ({ id: t.id, text: t.text, url: `https://x.com/${handle}/status/${t.id}`, publishedAt: typeof t.created_at === 'string' && Number.isFinite(Date.parse(t.created_at)) ? t.created_at : null, airdropSignal: looksLikeAirdrop(t.text) })) };
    },
    async test(token, handle) { await client.readAccount(token, handle); },
  };
  return client;
}
