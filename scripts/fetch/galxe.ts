/**
 * Galxe 数据源适配器（真实探测 + 明确降级）。
 *
 * 现状说明（实测，不是猜的）：
 *   https://app.galxe.com/quest/explore/all 是纯客户端渲染应用，
 *   服务端返回的 HTML 只有一个空壳（约 3KB，无任务数据），
 *   而官方 GraphQL 需要登录态 / API Key。
 *
 * 因此本适配器的策略是：
 *   - 真实发起请求，探测可用性，并把结果如实写入 source-health.json；
 *   - 解析不到任务时**明确报错**（而不是伪造数据），由 runner 隔离，
 *     前端据此向用户透明说明「该来源当前不可用」。
 *
 * 这样做符合方案第 28 章：宁可透明失败，也不要假装成功。
 */

import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';
import { fetchText } from './lib/http';

const EXPLORE = 'https://app.galxe.com/quest/explore/all';

export const galxeAdapter: SourceAdapter = {
  name: 'Galxe',
  url: EXPLORE,

  async fetch(): Promise<RawItem[]> {
    const html = await fetchText(EXPLORE, { timeoutMs: 20_000, retries: 1 });

    // Galxe 的 SSR 输出里没有任何 quest 数据；尝试从内联 JSON 里找任务标记。
    // 目前阶段命中率极低，命中才产出，否则如实失败。
    const inlineMatch = html.match(/"quests?"\s*:\s*(\[[\s\S]{20,}?\])/);
    if (!inlineMatch) {
      throw new Error(
        `页面为纯客户端渲染，服务端 HTML 未包含任务数据（${html.length} 字节），需官方 API 才能接入`,
      );
    }

    try {
      const quests = JSON.parse(inlineMatch[1]) as {
        name?: string;
        title?: string;
        slug?: string;
      }[];
      if (!Array.isArray(quests) || quests.length === 0) {
        throw new Error('内联任务数组为空');
      }
      const fetchedAt = new Date().toISOString();
      return quests
        .filter((q) => q.name || q.title)
        .map<RawItem>((q) => {
          const title = (q.name ?? q.title) as string;
          const slug = q.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return {
            sourceType: 'quest_platform',
            sourceName: 'Galxe',
            sourceUrl: EXPLORE,
            title,
            url: `https://app.galxe.com/quest/${slug}`,
            statusText: 'potential',
            fetchedAt,
          };
        });
    } catch (e) {
      throw new Error(`内联任务数据解析失败：${(e as Error).message}`);
    }
  },
};
