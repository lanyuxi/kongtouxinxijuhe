/**
 * 官方 X 账号索引回填（issue #28）。
 *
 * 解决的问题：
 *   用户要求接入 X 信息源。实测结论是「推文抓不到」（无凭据 + 网络层被重置，
 *   见 scripts/fetch/twitter.ts 头部注释）。但这里面有一部分工作是**确定性**的，
 *   不依赖任何网络请求，可以无条件做掉：
 *
 *     把每个项目对应的官方 X 账号落到 `project.official.x` 上。
 *
 *   这样一来用户至少可以：
 *     1) 从项目详情页一键跳到官方 X，自己核对一手消息（空投第一现场就在 X）
 *     2) 该 X 链接会进入真实性证据链（evidence），提高置信度
 *     3) 等 X_BEARER_TOKEN 就绪时，抓到的推文能直接挂到同一个 handle 上，无需改数据模型
 *
 * 为什么不能靠「猜」handle：
 *   实测 259 个项目里，有 199 个能从 DefiLlama 拿到 twitter 字段。
 *   剩下 60 个（如 lightning-network / aiw3 / arcium）**在公开数据里没有 X 账号**。
 *   此时绝不按项目名拼一个 `x.com/<slug>` —— 那会指向不存在或他人的账号，
 *   属于把用户往钓鱼账号上引。宁可留空，前端明确显示「暂无官方 X 账号」。
 *
 * 数据来源与优先级（与项目既有原则一致：人工 > 第三方）：
 *   1. 库内已有 official.x（DefiLlama 抓取时写入 / 上一轮回填）—— 不做覆盖
 *   2. data/seed/official-profiles.json 的人工核实档案
 *
 * 安全约束（不变量 4）：
 *   只接受**域名精确等于 x.com / twitter.com** 的链接。
 *   handle 必须通过白名单校验（排除 i / intent / share 等保留路径），
 *   绝不做「子串包含」匹配（历史上 x.com 误杀 frax.com 的教训）。
 */

import type { AirdropProject } from '../../src/lib/types';
import { handleFromUrl } from '../fetch/twitter';

export interface BackfillResult {
  projects: AirdropProject[];
  /** 本轮真正补上 X 链接的项目数 */
  filled: number;
  /** 无公开 X 账号、决定留空的项目 */
  missing: string[];
  /** 链接非法被拒的项目 */
  rejected: { slug: string; reason: string }[];
}

/** 校验一个 X 链接是否够格写入 official.x；不够格返回 undefined */
export function normalizeXUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const handle = handleFromUrl(raw);
  // handleFromUrl 内部已做域名精确匹配 + 保留路径排除
  if (!handle) return undefined;
  // handle 只允许字母 / 数字 / 下划线，长度 1..15（X 的账号规则）
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return undefined;
  return `https://x.com/${handle}`;
}

/** 人工档案里的官方 X（只取合法值） */
export interface XSeed {
  slug: string;
  x: string;
}

export function backfillXHandles(
  projects: AirdropProject[],
  seeds: XSeed[] = [],
): BackfillResult {
  const seedMap = new Map<string, string>();
  for (const s of seeds) {
    const url = normalizeXUrl(s.x);
    if (url) seedMap.set(s.slug, url);
  }

  let filled = 0;
  const missing: string[] = [];
  const rejected: { slug: string; reason: string }[] = [];

  const out = projects.map((p) => {
    // 1) 已有 X：只做合法性校正，不覆盖
    if (p.official?.x) {
      const existing = normalizeXUrl(p.official.x);
      if (existing) {
        return existing === p.official.x
          ? p
          : { ...p, official: { ...p.official, x: existing } };
      }
      // 已有值非法 → 记下来，但不静默掩盖
      rejected.push({ slug: p.slug, reason: `official.x 非法：${p.official.x}` });
      return { ...p, official: { ...p.official, x: undefined } };
    }

    // 2) 人工档案补齐
    const seeded = seedMap.get(p.slug);
    if (seeded) {
      filled++;
      return { ...p, official: { ...p.official, x: seeded } };
    }

    // 3) 没有可靠来源 → 留空（绝不猜）
    missing.push(p.slug);
    return p;
  });

  return { projects: out, filled, missing, rejected };
}
