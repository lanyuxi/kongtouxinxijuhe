/**
 * Airdrops.io 数据源适配器（真实抓取）。
 *
 * 抓取策略：
 *   1) 列表页：4 个分类页（latest / confirmed / speculative / claims），提取项目卡片链接
 *   2) 详情页：解析 airdrops.io 固定的模板结构（.airdrop-info / .status-indicator /
 *      .airdrop-description / .airdrop-guide），拿到官方外链、状态、分步教程
 *
 * 为什么可以这样做：
 *   airdrops.io 使用 WordPress + 稳定的自定义模板类名（airdrop-single / airdrop-guide），
 *   这些类名是其前端 JS 的挂载点，不会随意改动；因此比「猜 DOM 层级」可靠得多。
 *
 * 失败语义：任何一个分类页失败只丢该页，全部失败才 throw
 *          （由 runner 隔离并保留 Last Known Good）。
 */

import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';
import { fetchText, mapPool } from './lib/http';
import {
  extractBalancedBlock,
  extractLinks,
  firstBlockByClass,
  pruneNoise,
  sliceBalanced,
  stripTags,
} from './lib/html';

const BASE = 'https://airdrops.io';

/** 分类页 → 我们内部的状态语义 */
const LIST_PAGES: { url: string; status: string }[] = [
  { url: `${BASE}/latest/`, status: 'new' },
  { url: `${BASE}/confirmed/`, status: 'confirmed' },
  // 说明：airdrops.io 的「潜在空投」没有独立列表页（/potential/ 已 404），
  // 该语义由 /speculative/ 承载（尚未确认的猜测类项目）。
  { url: `${BASE}/speculative/`, status: 'potential' },
  { url: `${BASE}/claims/`, status: 'claim_live' },
];

/**
 * 从步骤 HTML 里挑出「真正的官方步骤链接」。
 *
 * 判定标准只有一条：链接的主机名必须等于该项目的官方域名（officialHost）。
 * 这样既排除聚合站自己的 `/visit/`、`/goto/bybit/` 跳转，也排除
 * 同一段里顺带提到的交易所 / 跨链组件等第三方链接。
 * 取不到官方链接时返回 undefined —— 宁可不标来源，也不冒充可追溯。
 */
export function officialStepLink(html: string, officialHost?: string): string | undefined {
  if (!html || !officialHost) return undefined;
  const host = officialHost.replace(/^www\./, '').toLowerCase();
  for (const l of extractLinks(html)) {
    try {
      const u = new URL(l.href);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (h === host) return l.href;
    } catch {
      /* 相对链接（聚合站站内跳转）一律不算官方来源 */
    }
  }
  return undefined;
}

/** 详情页解析结果 */
interface Detail {
  /** 聚合站给出的状态判定原文，例如「unconfirmed」 */
  question?: string;
  officialUrl?: string;
  officialHost?: string;
  status?: string;
  category?: string;
  chain?: string;
  description?: string;
  steps: { title: string; body: string; url?: string }[];
}

/** airdrops.io 的 outbound 跳转链接形如 /visit/odb3/，真实域名放在 data-outbound-host */
function resolveOutbound(html: string): { url?: string; host?: string } {
  const m = html.match(/<a\b[^>]*href=["']([^"']*\/visit\/[^"']*)["'][^>]*>/i);
  if (!m) return {};
  const host = m[0].match(/data-outbound-host=["']([^"']+)["']/i)?.[1];
  return { url: host ? `https://${host}` : undefined, host: host || undefined };
}

function parseDetail(html: string): Detail {
  const clean = pruneNoise(html);

  // ---- 基础信息（官方链接 / 状态 / 链） ----
  const infoBlock = firstBlockByClass(clean, 'airdrop-info') ?? '';
  const infoText = stripTags(infoBlock);
  const outbound = resolveOutbound(infoBlock);

  const status = clean.match(/<div class=["']status-indicator\s+([a-z-]+)["']/i)?.[1];
  const chain = infoText.match(/Chain:\s*([^|]+?)(?:\s{2,}|$)/i)?.[1]?.trim();
  const question = infoText.match(/Airdrop\s+([a-z ]+)/i)?.[1]?.trim();

  // ---- 描述（用于 tagline 与成本线索） ----
  const descBlock = firstBlockByClass(clean, 'airdrop-description') ?? '';
  const paragraphs = (descBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [])
    .map((p) => stripTags(p))
    .filter((p) => p.length > 40);
  const description = paragraphs[0];

  // ---- 教程步骤（.airdrop-guide 内的 h3.is-step-item + 紧随的 .step-body） ----
  // 注意：这里必须用深度平衡匹配。指南容器内部有多层 div/section，
  // 简单正则会在第一个 </div> 处截断，导致一条步骤都取不到。
  const guideBlock = extractBalancedBlock(clean, 'airdrop-guide') ?? '';
  const steps: Detail['steps'] = [];
  const marks: number[] = [];
  const h3Re = /<h3\b[^>]*class=["'][^"']*is-step-item[^"']*["'][^>]*>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = h3Re.exec(guideBlock))) marks.push(hm.index);

  for (const at of marks) {
    const h3 = sliceBalanced(guideBlock, at, 'h3');
    const rest = guideBlock.slice(at + h3.length);
    const bodyAt = rest.search(/<div\b[^>]*class=["'][^"']*step-body/i);
    const bodyHtml = bodyAt >= 0 ? sliceBalanced(rest, bodyAt, 'div') : '';
    const title = stripTags(h3).replace(/^Step\s*\d+\s*:\s*/i, '');
    const body = stripTags(bodyHtml);
    /**
     * 步骤来源链接（P1-2）。
     *
     * ⚠️ 不能无脑取第一个链接：教程正文里混着聚合站自己的**广告跳转**，
     *    实测 `https://airdrops.io/goto/bybit/` 这类返佣链接就出现在
     *    「Step 4: Fund your exchange account」里，而它既不是官方步骤，
     *    也不带任何操作信息。
     *
     *    历史后果（本轮实测）：这些广告步骤会被判成「可追溯到来源」的
     *    真实教程（`source_verified = true`），于是
     *      · `guide_source = 'sourced'`，
     *      · 模板教程的等级上限（最高 B）完全失效，
     *      · 最终 28 个项目显示「建议参与」，而它们的教程里含有
     *        「跨链资金 · 无需离开本页即可在 30 多条链之间兑换」这种
     *        与空投参与毫无关系的推广段落。
     *
     *    处理原则：只有指向**该项目自己的域名**的链接才算步骤来源；
     *    聚合站站内链接（/visit/、/goto/、/go/ 等跳转页）一律忽略。
     *    忽略后 `url` 为 undefined，`source_verified` 自然为 false ——
     *    这是「如实标注」，不是「丢失信息」。
     */
    const link = officialStepLink(bodyHtml, outbound.host);
    if (title) steps.push({ title, body, url: link });
  }

  // ---- 分类（article 上的 categories-xxx class） ----
  const category =
    clean.match(/class=["'][^"']*\bcategories-([a-z0-9-]+)["']/i)?.[1]?.replace(/-/g, ' ') ??
    undefined;

  return {
    question,
    officialUrl: outbound.url,
    officialHost: outbound.host,
    status: status || undefined,
    category,
    chain,
    description,
    steps,
  };
}

/**
 * 站内「非项目」路径白名单式排除。
 *
 * 为什么必须显式排除：
 *   详情页正文里会引用大量站内链接（导航、FAQ、日历、公告、交易所返佣跳转），
 *   它们的路径结构同样是「一层路径段」，仅靠结构无法区分。
 *   这些页面一旦被当成项目，就会产生「blog」「faq」「bybit」这类垃圾条目，
 *   并且会污染 Last Known Good 数据。因此这里用「保留路径清单」双重过滤。
 */
const RESERVED_PATHS = new Set([
  'latest',
  'confirmed',
  'potential',
  'speculative',
  'claims',
  'calendar',
  'airdrop-alert',
  'blog',
  'faq',
  'contact',
  'stay-safe',
  'reviews',
  'about',
  'privacy-policy',
  'terms',
  'disclaimer',
  'category',
  'tag',
  'page',
  'author',
  'search',
  'visit',
  'goto',
  'feed',
  'sitemap',
  'wp-login',
  'wp-admin',
]);

/** 返佣 / 跳转路径（/goto/bybit/ 之类）不是项目页 */
const REFERRAL_PATH = /^\/(goto|visit|go|out)\//i;

/** 从列表页提取项目详情页链接（排除分类页、运营页与跳转链接） */
function extractProjectLinks(html: string): string[] {
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["'](https:\/\/airdrops\.io\/[^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    const pathname = new URL(url).pathname;
    if (REFERRAL_PATH.test(pathname)) continue;
    const seg = pathname.replace(/^\/|\/$/g, '');
    // 项目页只有一层路径段
    if (seg.includes('/') || !seg) continue;
    if (RESERVED_PATHS.has(seg.toLowerCase())) continue;
    // 需要字母，排除纯数字（分页 / 时间归档）
    if (!/[a-z]/i.test(seg)) continue;
    seen.add(`${BASE}/${seg}/`);
  }
  return Array.from(seen);
}

export const airdropsIoAdapter: SourceAdapter = {
  name: 'Airdrops.io',
  url: `${BASE}/latest/`,

  async fetch(): Promise<RawItem[]> {
    const fetchedAt = new Date().toISOString();

    // 1) 并发抓分类页，逐页容错
    const pageResults = await mapPool(LIST_PAGES, 2, async (page) => {
      try {
        const html = await fetchText(page.url);
        return { page, links: extractProjectLinks(html) };
      } catch (e) {
        console.warn(`[airdrops-io] 分类页失败 ${page.url}：${(e as Error).message}`);
        return { page, links: [] as string[] };
      }
    });

    /** slug → 首个命中的分类状态（先出现的优先，保证 claims/confirmed 优先于 latest） */
    const slugStatus = new Map<string, { url: string; status: string }>();
    for (const { page, links } of pageResults) {
      for (const link of links) {
        const slug = new URL(link).pathname.replace(/^\/|\/$/g, '');
        if (!slugStatus.has(slug)) slugStatus.set(slug, { url: link, status: page.status });
      }
    }

    if (slugStatus.size === 0) throw new Error('Airdrops.io 全部分类页抓取失败或未解析到项目');

    // 2) 并发抓详情页（限流 4，礼貌抓取）
    const entries = Array.from(slugStatus.entries());
    const items = await mapPool(entries, 4, async ([slug, meta]) => {
      let detail: Detail = { steps: [] };
      try {
        detail = parseDetail(await fetchText(meta.url));
      } catch (e) {
        // 详情页失败不算致命：仍保留列表页提供的基础信息
        console.warn(`[airdrops-io] 详情页失败 ${meta.url}：${(e as Error).message}`);
      }

      const name = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const item: RawItem = {
        sourceType: 'airdrop_aggregator',
        sourceName: 'Airdrops.io',
        sourceUrl: meta.url,
        title: name,
        url: meta.url,
        description: detail.description,
        statusText: detail.status ?? meta.status,
        categoryText: detail.category,
        chainText: detail.chain,
        officialUrl: detail.officialUrl,
        officialHost: detail.officialHost,
        steps: detail.steps,
        fetchedAt,
      };
      return item;
    });

    return items.filter((i) => !!i.title);
  },
};
