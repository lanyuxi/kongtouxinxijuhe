import type { AirdropProject } from '../../src/lib/types';
import { collectPendingTranslations } from '../i18n/review-queue.mjs';
import { cacheKey, getCache, hasChinese, loadCache, localizeText, needsTranslation, protectTerms, restoreTerms } from '../i18n/translate.mjs';

/** 只补译新教程；已审核译文和缓存优先。失败条目下一轮重试，不清空已有译文。 */
export async function translateTutorials(projects: AirdropProject[]) {
  const texts = [...new Set(collectPendingTranslations(projects).items
    .filter(item => item.locations.some(location => location.field.startsWith('步骤')))
    .map(item => cacheKey(item.original)))];
  const cache = { ...getCache() };
  const deadline = Date.now() + 120_000;
  let cursor = 0;
  let translated = 0;
  let failed = 0;
  async function worker() {
    while (cursor < texts.length && Date.now() < deadline) {
      const original = texts[cursor++];
      try {
        const zh = await translate(original, deadline);
        cache[original] = zh;
        loadCache(cache);
        if (needsTranslation(localizeText(original).zh)) {
          delete cache[original];
          loadCache(cache);
          throw new Error('译文仍包含未翻译的英文句段');
        }
        translated++;
      } catch (error) {
        failed++;
        console.warn(`[i18n] 教程自动翻译失败，下轮重试：${(error as Error).message}`);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return { translated, failed, remaining: texts.length - translated };
}

async function translate(original: string, deadline: number): Promise<string> {
  const protectedText = protectTerms(original);
  // 数额、合约地址、链接和新代币符号也必须原样保留，不能交给引擎改写。
  const text = protectedText.text.replace(/⟦T\d+⟧|https?:\/\/[^\s]+|0x[a-fA-F0-9]{40}\b|\$[A-Za-z][\w]*|\b\d+(?:[.,]\d+)*(?:%)?/g, match => {
    if (match.startsWith('⟦')) return match;
    protectedText.tokens.push(match);
    return `⟦T${protectedText.tokens.length - 1}⟧`;
  });
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 1200) {
    const split = rest.lastIndexOf(' ', 1200);
    if (split <= 0) throw new Error('教程文本单段过长，无法安全拆分');
    chunks.push(rest.slice(0, split));
    rest = rest.slice(split + 1);
  }
  chunks.push(rest);
  const output: string[] = [];
  for (const chunk of chunks) {
    const timeout = Math.min(10_000, deadline - Date.now());
    if (timeout <= 0) throw new Error('本轮翻译时间已用完');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(chunk);
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!response.ok) throw new Error(`翻译接口 HTTP ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json?.[0]) || !json[0].length || json[0].some((part: unknown[]) => typeof part?.[0] !== 'string')) throw new Error('翻译接口返回结构异常');
      output.push(json[0].map((part: string[]) => part[0]).join(''));
    } finally {
      clearTimeout(timer);
    }
  }
  const joined = output.join(' ');
  for (const [i] of protectedText.tokens.entries()) {
    const marker = `⟦T${i}⟧`;
    if (joined.split(marker).length !== text.split(marker).length) throw new Error('译文丢失或重复了关键数额、代币或链接');
  }
  const zh = restoreTerms(joined, protectedText.tokens).replace(/\s+/g, ' ').trim();
  if (!hasChinese(zh) || /⟦|⟧|__T\d+__/.test(zh)) throw new Error('翻译结果缺少中文或包含损坏占位符');
  return zh;
}
