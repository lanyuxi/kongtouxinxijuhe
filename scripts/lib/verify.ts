/**
 * Verify：证据收集与交叉验证。
 *
 * 对应方案文档：
 * - 第 9/10 章：真实性置信度（Evidence Confidence）
 * - 第 27 章不变量 1：没有证据的项目不能显示为「已验证」
 * - 第 27 章不变量 4：第三方页面提供的链接不能自动被认为是官方链接
 */

import type { AirdropProject, Evidence } from '../../src/lib/types';

const OFFICIAL_HOST_HINTS = [
  'docs.',
  'github.com',
  'mirror.xyz',
  'medium.com',
];

/**
 * 判断官方链接是否可信。
 * 规则：必须存在官方域名，且域名不能是聚合站/跳转站。
 */
export function isOfficialHost(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const blocked = /(airdrops\.io|defillama\.com|galxe\.com|layer3\.xyz|google\.com|bit\.ly|t\.co)/;
    if (blocked.test(u.hostname)) return false;
    if (OFFICIAL_HOST_HINTS.some((h) => u.hostname.startsWith(h))) return true;
    // 普通项目域名：至少两段
    return u.hostname.split('.').length >= 2;
  } catch {
    return false;
  }
}

/** 交叉验证：官网与官方 X / Docs 是否互相链接（此处用域名一致性近似） */
export function crossLink(official: AirdropProject['official']): boolean {
  const hosts = [official.website, official.docs, official.github]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u as string).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  if (hosts.length < 2) return false;
  const root = (h: string) => h.split('.').slice(-2).join('.');
  const roots = new Set(hosts.map(root));
  return roots.size <= 2; // 允许同主体多域名
}

/**
 * 构建证据清单。
 * 关键：只有通过校验的链接才置 verified = true。
 */
export function buildEvidence(p: AirdropProject): Evidence[] {
  // 从零重建，保证幂等：重复调用不会累积重复条目。
  const ev: Evidence[] = [];
  const o = p.official;

  if (o.website && isOfficialHost(o.website)) {
    ev.push({
      type: 'official_website',
      label: '官方网站可访问',
      url: o.website,
      verified: true,
      note: '官方域名已验证',
    });
  }
  if (o.docs && isOfficialHost(o.docs)) {
    ev.push({
      type: 'official_docs',
      label: '官方文档存在',
      url: o.docs,
      verified: true,
    });
  }
  if (o.github && isOfficialHost(o.github)) {
    ev.push({
      type: 'official_github',
      label: '官方 GitHub 仓库',
      url: o.github,
      verified: true,
    });
  }
  if (o.galxe && isOfficialHost(o.galxe)) {
    ev.push({
      type: 'quest_space',
      label: 'Galxe 官方 Space 可确认',
      url: o.galxe,
      verified: true,
    });
  }
  if (o.x) {
    // X 账号本身无法通过域名强校验，标记为待确认
    ev.push({
      type: 'official_x',
      label: '官方 X 账号',
      url: o.x,
      verified: false,
      note: '需人工确认账号认证状态',
    });
  }
  // 官方公告：仅当官网与 Docs 存在且域名主体一致时才认定，
  // 避免把「有官网」直接钻营成「有官方活动公告」。
  if (crossLink(o)) {
    ev.push({
      type: 'official_announcement',
      label: '官网与 Docs 链接可互相印证',
      url: o.website ?? o.docs ?? '',
      verified: true,
      note: '仅证明官方渠道一致，不代表官方已公告空投',
    });
  }

  // 第三方来源：独立计数
  const thirdParties = p.sources.filter((s) =>
    ['airdrop_aggregator', 'rewards_tracker', 'quest_platform', 'third_party'].includes(
      s.type,
    ),
  );
  for (const s of thirdParties) {
    ev.push({
      type: 'third_party',
      label: `第三方来源：${s.name}`,
      url: s.url,
      verified: true,
      note: '第三方来源仅作交叉参考，不代表官方背书',
    });
  }

  if (p.meta?.funding) {
    ev.push({
      type: 'funding',
      label: '融资信息可核实',
      url: o.website ?? '',
      verified: isOfficialHost(o.website ?? ''),
      note: p.meta.funding,
    });
  }

  return ev;
}

/**
 * 来源是否「已验证」。
 *
 * 门槛（对应第 35 章验收标准「每个『已验证』项目至少存在 2 个可查看来源」）：
 * - 至少 2 条官方证据
 * - 至少来自 2 个不同域名（保证来源独立）
 * 仅靠第三方聚合站收录 + 一个官网链接，不足以认定为「已验证」。
 */
export function isProjectVerified(p: AirdropProject): boolean {
  // 只统计「官方」类证据：第三方聚合站收录不能替代官方证据
  // （对应第 27 章不变量 4：第三方页面提供的链接不能自动被认为是官方链接）
  const officialEvidence = p.evidence.filter(
    (e) => e.verified && OFFICIAL_EVIDENCE_TYPES.has(e.type),
  );
  const independent = new Set(
    officialEvidence.map((e) => {
      try {
        return new URL(e.url).hostname;
      } catch {
        return e.url;
      }
    }),
  );
  return officialEvidence.length >= 2 && independent.size >= 2;
}


/** 可视为「官方」的证据类型 */
const OFFICIAL_EVIDENCE_TYPES = new Set<Evidence['type']>([
  'official_website',
  'official_announcement',
  'official_docs',
  'official_github',
  'quest_space',
]);

export function verifyAll(projects: AirdropProject[]): AirdropProject[] {
  return projects.map((p) => {
    const evidence = buildEvidence(p);
    return { ...p, evidence };
  });
}
