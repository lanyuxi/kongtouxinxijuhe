/**
 * 抓取公共工具：带超时、重试、UA 伪装与「永不抛给全局」的容错封装。
 *
 * 对应方案文档第 28 章：单个来源失败必须被隔离。
 * 因此这里只做「尽力而为」的抓取，失败一律以异常形式交给 runner 捕获。
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface FetchOptions {
  /** 单次请求超时（毫秒），默认 20s */
  timeoutMs?: number;
  /** 失败重试次数（不含首次），默认 1 次 */
  retries?: number;
  accept?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 抓取文本（HTML / JSON 均可）。失败时 throw，由调用方决定是否降级。 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 20_000, retries = 1, accept = 'text/html,application/json,*/*' } = options;
  let lastError: Error = new Error('未执行');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.9' },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastError = e as Error;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`抓取失败 ${url}：${lastError.message}`);
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, { ...options, accept: 'application/json' });
  return JSON.parse(text) as T;
}

/** 并发池：限制同时进行的请求数，避免把对端打挂 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
