/**
 * 教程中文化：把数据源抓到的英文教程标题 / 正文转成面向中文用户的文案。
 *
 * 为什么在构建期做，而不是浏览器里做：
 *   1. 方案约束「纯静态、零服务端、零运行时 AI」——浏览器端不能出现任何翻译凭据；
 *   2. 构建期生成 → 结果落盘进仓库 → 可 review、可 diff、可复现，
 *      不会出现「同一个项目两次打开文案不一样」；
 *   3. 离线可用，用户在网络受限时也能看到中文教程。
 *
 * 输出约定（对应 issue #28 的要求）：
 *   - 有中文时只展示中文；
 *   - 原文是英文时，中文正文之外**必须同时保留英文原文**，
 *     由前端在步骤下方以「原文对照」形式展示；
 *   - 专有名词（项目名 / 代币符号 / 工具名）一律保留英文原样，
 *     确保用户能在钱包、交易所里对上号。
 */

import {
  HUMAN_FIX,
  TERM_MAP,
  TOKEN_TERMS,
  polishTitle,
  unifyPerson,
  normalizeSpacing,
} from './glossary.mjs';

/** 中文判定：只要含有汉字就认为已是中文文案 */
export function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text ?? ''));
}

/**
 * 术语保护：把专有名词替换成占位符再交给翻译引擎。
 *
 * 为什么必须做：翻译引擎会把 `Mint USDe` 译成「铸币美元」、
 * 把 `SUI for Gas` 译成「用于燃气的 SUI」，用户照着做会找不到对应按钮。
 * 用占位符（__T0__）锁住后，译文里这些词会原样回来。
 */
export function protectTerms(text) {
  let out = String(text ?? '');
  const tokens = [];
  for (const term of TOKEN_TERMS) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_])`, 'g');
    out = out.replace(re, () => {
      tokens.push(term);
      return ` __T${tokens.length - 1}__ `;
    });
  }
  return { text: out, tokens };
}

/** 还原受保护的专有名词 */
export function restoreTerms(text, tokens) {
  let out = String(text ?? '');
  tokens.forEach((term, i) => {
    out = out.replace(new RegExp(`_\\s*_?T${i}_\\s*_`, 'g'), term);
    out = out.replace(new RegExp(`__T${i}__`, 'g'), term);
  });
  // 兜底：仍有未还原的占位符时，说明索引错位，宁可保留占位符也不静默丢失原文
  return out;
}

/**
 * 缓存键：一律使用**英文原文**。
 *
 * 为什么不用「术语替换后的占位符文本」做键（曾经的失败方案）：
 *   占位符编号依赖遍历顺序，翻译与查表发生在两个不同进程、不同代码路径上，
 *   一旦编号漂移，查表就会静默失败 —— 表现为「原文是英文、译文也没出来」，
 *   页面上只剩英文，而且不会报错（正是这次要修的问题）。
 *   用原文做键后，键本身可读、可 review、可 diff，也不会因术语表调整而失效。
 *   术语保护改为在译文上做**修正映射**（见 applyGlossary），效果相同但更稳。
 */
export function cacheKey(text) {
  return String(text ?? '').replace(/\\s+/g, ' ').trim();
}

/** 术语表与人工修正：统一站内口径 */
export function applyGlossary(text) {
  let out = String(text ?? '').trim();
  if (HUMAN_FIX[out]) out = HUMAN_FIX[out];
  for (const [re, to] of TERM_MAP) out = out.replace(re, to);
  out = unifyPerson(out);
  out = normalizeSpacing(out);
  return out.trim();
}

/**
 * 生成「中英对照」条目。
 *
 * 返回结构刻意与数据形态解耦（这里只处理纯文本），
 * 由调用方决定挂到 GuideStep 的哪个字段上。
 */
export function localizeText(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { zh: '', en: undefined };
  if (hasChinese(raw)) return { zh: raw, en: undefined };
  const zh = applyGlossary(translateWithCache(raw));
  if (!hasChinese(zh)) return { zh: raw, en: undefined };
  return { zh, en: raw };
}

let CACHE = null;
let REVERSE = null;

/** 加载构建期已落盘的机器翻译缓存（scripts/i18n/cache.zh.json） */
export function loadCache(cache) {
  CACHE = cache && typeof cache === 'object' ? cache : {};
  REVERSE = null; // 缓存换了一份，反向索引必须重建
  return CACHE;
}

export function getCache() {
  return CACHE ?? {};
}

/**
 * 从缓存取译文的**唯一入口**。
 *
 * 关键设计：这里**绝不调用外部接口**。
 * 翻译只在离线准备阶段（scripts/i18n/build-cache.mjs）执行一次并把结果提交进仓库，
 * 构建 / 定时抓取时纯查表 —— 保证流水线不依赖任何第三方服务的可用性，
 * 也不会因为对方限流导致站点文案时好时坏。
 * 查不到时回退英文原文（前端会据此走「原文对照」分支），不会静默出现空白。
 */
function translateWithCache(text) {
  const cache = getCache();
  const key = cacheKey(text);
  if (cache[key]) return cache[key];
  // 缓存里没有：按句子级再做一次查表，尽量拼出中文
  const parts = key.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length > 1) {
    const hits = parts.map((p) => cache[cacheKey(p)] ?? null);
    if (hits.every((h) => h !== null)) return hits.join('');
  }
  return text;
}

/**
 * 反向查表：由中文译文找回英文原文。
 *
 * 为什么需要：tagline 一旦被译成中文并落盘，下一轮读回时
 * `hasChinese(tagline) === true`，就没有「英文原文」可挂了，
 * 详情页的「原文对照」会永远缺失。缓存里同时有中英两栏，
 * 建一张反向索引即可找回，无需额外存储。
 *
 * 注意：只在缓存里唯一命中时返回，多个英文原文对应同一译文时返回 undefined ——
 * 宁可没有对照，也不能挂一句「不一定是它」的原文。
 */
export function reverseLookup(zh) {
  if (!REVERSE) {
    REVERSE = new Map();
    for (const [en, translated] of Object.entries(getCache())) {
      const key = String(translated ?? '').trim();
      if (!key) continue;
      if (REVERSE.has(key)) REVERSE.set(key, null); // 冲突 → 标记为不可用
      else REVERSE.set(key, en);
    }
  }
  const hit = REVERSE.get(String(zh ?? '').trim());
  return hit ?? undefined;
}

/** 标题专用：额外做一次标题化收尾 */
export function localizeTitle(text) {
  const { zh, en } = localizeText(text);
  if (!zh) return { zh: '', en };
  const patched = HUMAN_FIX[zh.trim()] ?? zh;
  return { zh: polishTitle(patched), en };
}
