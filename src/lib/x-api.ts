import type { XFailure, XReply, XResult, XSettings, XTask } from './x-api-types';
export class XRequestError extends Error { constructor(message: string, public code = 'upstream') { super(message); } }
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const validFailure = (value: any): value is XFailure => value && typeof value.code === 'string' && typeof value.message === 'string';
function validTask(value: any): value is XTask {
  return value === null || (!!value && typeof value.id === 'string' && ['running', 'success', 'partial', 'failed'].includes(value.state) && Number.isInteger(value.checked) && Number.isInteger(value.total) && typeof value.startedAt === 'string' && nullableString(value.finishedAt) && Array.isArray(value.failures) && value.failures.every((f: any) => typeof f.handle === 'string' && validFailure(f.error)));
}
async function request<T>(route: string, method = 'GET', payload?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/x/${route}`, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}), signal: AbortSignal.timeout(40_000) }); }
  catch { throw new XRequestError('无法连接配置后台，请检查连接后重试。', 'unavailable'); }
  if (!response.headers.get('content-type')?.includes('application/json') || response.status === 404) throw new XRequestError('当前部署未接入配置后台', 'unavailable');
  let reply: XReply<T>;
  try { reply = await response.json(); } catch { throw new XRequestError('后台返回的数据格式不完整'); }
  if (!reply || typeof reply.ok !== 'boolean') throw new XRequestError('后台返回的数据格式不完整');
  if (!reply.ok) {
    if (!validFailure(reply.error)) throw new XRequestError('后台返回的数据格式不完整');
    throw new XRequestError(reply.error.message, reply.error.code);
  }
  if (!response.ok) throw new XRequestError('配置后台未完成本次操作，请重试。');
  return reply.data;
}
function settings(value: any): XSettings {
  if (!value || typeof value.configured !== 'boolean' || !nullableString(value.testedAt) || (value.testError !== null && !validFailure(value.testError)) || !validTask(value.task)) throw new XRequestError('后台返回的数据格式不完整');
  return { configured: value.configured, testedAt: value.testedAt, testError: value.testError, task: value.task };
}
export const getXSettings = async () => settings(await request('settings'));
export const saveXSettings = async (token: string) => settings(await request('settings', 'POST', { token }));
export const testXSettings = async () => settings(await request('test', 'POST'));
export const deleteXSettings = async (): Promise<void> => { await request('settings', 'DELETE'); };
export const refreshX = async (): Promise<XTask> => {
  const task = await request<XTask>('refresh', 'POST'); if (!task || !validTask(task)) throw new XRequestError('后台返回的数据格式不完整'); return task;
};
export async function getXResult(): Promise<XResult> {
  const value = await request<XResult>('result');
  if (!value || !validTask(value.task) || !nullableString(value.lastSuccessAt) || !Array.isArray(value.accounts) || value.accounts.some(a => !a || !/^[a-z0-9_]{1,15}$/i.test(a.handle) || !Array.isArray(a.slugs) || a.slugs.some(s => typeof s !== 'string') || typeof a.stale !== 'boolean' || typeof a.checkedAt !== 'string' || !Array.isArray(a.posts) || a.posts.some(p => !p || typeof p.id !== 'string' || typeof p.text !== 'string' || typeof p.url !== 'string' || !p.url.startsWith('https://x.com/') || typeof p.airdropSignal !== 'boolean' || !nullableString(p.publishedAt)))) throw new XRequestError('后台返回的数据格式不完整');
  return { task: value.task, lastSuccessAt: value.lastSuccessAt, accounts: value.accounts };
}
export const selectProjectUpdates = (result: XResult, slug: string) => result.accounts.filter(account => account.slugs.includes(slug));
