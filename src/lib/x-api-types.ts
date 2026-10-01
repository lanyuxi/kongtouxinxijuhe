export interface XFailure {
  code: 'invalid_input' | 'invalid_token' | 'forbidden' | 'credits' | 'rate_limit' | 'not_found' | 'timeout' | 'network' | 'upstream' | 'invalid_response' | 'not_configured' | 'busy' | 'interrupted';
  message: string;
}
export interface XTarget { handle: string; slugs: string[] }
export interface XPost { id: string; text: string; url: string; publishedAt: string | null; airdropSignal: boolean }
export interface XAccountResult { handle: string; slugs: string[]; checkedAt: string; posts: XPost[]; stale: boolean }
export interface XTask {
  id: string; state: 'running' | 'success' | 'partial' | 'failed'; checked: number; total: number;
  startedAt: string; finishedAt: string | null; failures: { handle: string; error: XFailure }[];
  dataChanged?: boolean;
}
export interface XSettings { configured: boolean; testedAt: string | null; testError: XFailure | null; task: XTask | null }
export interface XResult { task: XTask | null; lastSuccessAt: string | null; accounts: XAccountResult[] }
export type XReply<T> = { ok: true; data: T } | { ok: false; error: XFailure };
