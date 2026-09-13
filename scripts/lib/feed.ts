/**
 * RSS / Atom feed 生成：零服务端实现「新空投提醒」。
 *
 * 为什么值得做（第一性原理）：
 *   本站是纯静态站点，没有账号体系、没有推送通道，用户「回访」全靠自觉。
 *   竞品普遍提供邮件 / RSS 提醒，因为这是留存的关键动作。
 *   而邮件需要服务端与用户邮箱（违反「零服务器」约束），
 *   RSS 只需要**构建时生成一个静态 XML** —— 零成本、无隐私问题、离线可读。
 *
 * 设计取舍：
 *   1. **只放「值得点开」的项目**，不是全量 188 条。
 *      全量会淹没重点，读者会直接取关。筛选口径：等级 S/A、或处于「已确认 / 开放领取」、
 *      或最近 N 天内首次发现的，按发现时间倒序，上限 40 条。
 *   2. **每个条目的链接必须是可点开的具体地址**（站点 URL + #/project/<slug>），
 *      而不是相对路径 —— RSS 阅读器不保证保留站点上下文。
 *   3. **不做「原子性承诺」**：描述里带上风险等级与「请自行核对官方链接」的提醒，
 *      避免读者把 feed 当成「推荐买入」信号。
 *   4. 所有文本都做 XML 转义。项目名/简介来自第三方抓取，含 `&`、`<` 是常态，
 *      不转义会直接产生「非法 XML」，阅读器静默解析失败 —— 这类问题极难排查。
 */

import type { AirdropProject } from '../../src/lib/types';

/** 默认站点地址（GitHub Pages 项目站点）。构建时可用 SITE_URL 覆盖。 */
export const DEFAULT_SITE_URL = 'https://lanyuxi.github.io/kongtouxinxijuhe/';

export interface FeedOptions {
  /** 站点根地址，必须以 / 结尾 */
  siteUrl: string;
  /** 数据集更新时间（feed 的 <updated>） */
  updatedAt: string;
  /** 最多包含多少条 */
  limit?: number;
  /** 「最近发现」窗口天数 */
  recentDays?: number;
}

/** XML 文本转义（含属性用的引号） */
export function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const STATUS_TEXT: Record<AirdropProject['status'], string> = {
  new: '新发现',
  potential: '潜在空投',
  confirmed: '已确认',
  claim_live: '开放领取',
  ended: '已结束',
};

const RISK_TEXT: Record<AirdropProject['scores']['risk'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

/**
 * 挑选进入 feed 的项目。
 * 排除 ended（已结束的没有阅读价值），排除风险 critical（不做传播，避免误导）。
 */
export function selectFeedProjects(
  projects: AirdropProject[],
  { recentDays = 14, limit = 40 }: { recentDays?: number; limit?: number } = {},
  now = Date.now(),
): AirdropProject[] {
  const since = now - recentDays * 24 * 3600 * 1000;
  const picked = projects.filter((p) => {
    if (p.status === 'ended') return false;
    if (p.scores.risk === 'critical') return false;
    const worth =
      p.scores.grade === 'S' ||
      p.scores.grade === 'A' ||
      p.status === 'confirmed' ||
      p.status === 'claim_live' ||
      new Date(p.discovered_at).getTime() >= since;
    return worth;
  });
  picked.sort((a, b) => {
    const da = new Date(a.discovered_at).getTime();
    const db = new Date(b.discovered_at).getTime();
    if (da !== db) return db - da;
    return a.slug.localeCompare(b.slug, 'en');
  });
  return picked.slice(0, limit);
}

/** 单个项目的 feed 条目描述（纯文本，阅读器里可读性最好） */
export function feedItemSummary(p: AirdropProject, siteUrl: string): string {
  const lines = [
    p.tagline?.trim() || '暂无简介',
    '',
    `当前状态：${STATUS_TEXT[p.status]}｜风险等级：${RISK_TEXT[p.scores.risk]}｜价值等级：${p.scores.grade}`,
    `真实性置信度 ${p.scores.authenticity}/100｜参与价值 ${p.scores.value}/100`,
    `预计成本：资金 ${p.cost.capital_max_usd === 0 ? '免费' : `$${p.cost.capital_min_usd}–${p.cost.capital_max_usd}`}｜Gas $${p.cost.gas_estimate_usd}｜时间 ${p.cost.time_minutes} 分钟`,
  ];
  if (p.official?.website) lines.push('', `官方入口：${p.official.website}`);
  lines.push(
    '',
    '提示：本提醒仅汇总公开信息，不构成投资建议。请务必核对官方域名，任何要求输入助记词或先转账的都是骗局。',
    `详情页：${absoluteUrl(siteUrl, `#/project/${p.slug}`)}`,
  );
  return lines.join('\n');
}

/** 拼接站点内的绝对地址（hash 路由对 RSS 阅读器友好：不需要服务端重写） */
export function absoluteUrl(siteUrl: string, pathOrHash: string): string {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return `${base}${pathOrHash.replace(/^\/+/, '')}`;
}

/**
 * 生成 Atom feed。
 *
 * 为什么用 Atom 而不是 RSS 2.0：
 *   - Atom 的 `<updated>` / `<id>` 语义严格，日期必须是 RFC3339，阅读器行为一致；
 *   - RSS 2.0 的 `<pubDate>` 格式混乱（RFC822），历史上是阅读器兼容问题的高发区。
 *   主流阅读器（Feedly / Inoreader / NetNewsWire）都完整支持 Atom。
 */
export function buildAtomFeed(projects: AirdropProject[], options: FeedOptions): string {
  const { siteUrl, updatedAt } = options;
  const items = selectFeedProjects(projects, {
    recentDays: options.recentDays,
    limit: options.limit,
  });
  const feedId = absoluteUrl(siteUrl, 'feed.xml');
  const home = absoluteUrl(siteUrl, '');

  const entries = items
    .map((p) => {
      const url = absoluteUrl(siteUrl, `#/project/${p.slug}`);
      return [
        '  <entry>',
        `    <title>${escapeXml(`${p.name}｜${STATUS_TEXT[p.status]}｜风险${RISK_TEXT[p.scores.risk]}`)}</title>`,
        `    <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>`,
        `    <id>${escapeXml(url)}</id>`,
        `    <updated>${escapeXml(toRfc3339(p.last_changed_at || p.discovered_at || updatedAt))}</updated>`,
        `    <published>${escapeXml(toRfc3339(p.discovered_at || updatedAt))}</published>`,
        `    <summary type="text">${escapeXml(feedItemSummary(p, siteUrl))}</summary>`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">',
    '  <title>空投情报平台 · 新空投提醒</title>',
    `  <subtitle>${escapeXml('聚合公开空投线索，附真实性、风险与参与价值参考。不含投资建议。')}</subtitle>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(home)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedId)}"/>`,
    `  <id>${escapeXml(feedId)}</id>`,
    `  <updated>${escapeXml(toRfc3339(updatedAt))}</updated>`,
    '  <author>',
    '    <name>空投情报平台</name>',
    `    <uri>${escapeXml(home)}</uri>`,
    '  </author>',
    '  <rights>公开信息聚合，请以项目方官方公告为准。</rights>',
    entries,
    '</feed>',
    '',
  ]
    .filter(Boolean)
    .join('\n')
    // 若没有任何条目，<updated> 之后直接接 </feed>，上面的 filter 已处理空串
    .replace(/\n<\/feed>/, `${entries ? '\n' : ''}</feed>`);
}

/** ISO8601 → RFC3339（Atom 要求带时区；无时区时按 UTC 处理） */
export function toRfc3339(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
}
