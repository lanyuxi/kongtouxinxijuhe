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
      return ` ⟦T${tokens.length - 1}⟧ `;
    });
  }
  return { text: out, tokens };
}

/**
 * 占位符容错匹配式（真实故障的根因，两轮审查都没碰到）。
 *
 * 为什么不能只认 `__T0__`：
 *   翻译引擎**不保证**把占位符原样吐回。实测同一条句子它吐回过：
 *     `持有 __T0__ 即可获得每月空投`    ← 正常
 *     `持有 _ _T 0 _ _ 即可获得每月空投`  ← 下划线被拆开、数字被空格切开
 *     `持有 _   _T 0 _  __ 即可获得每月空投`
 *   旧实现的两条正则对后两种**全部匹配失败**，于是占位符原样留在译文里，
 *   被前端当正文展示给用户。根因是占位符选型——
 *   `_` 和空格都是引擎会自由重排的字符。
 *
 *   现改用 `⟦T0⟧`：实测引擎原样保留，且相邻占位符（`⟦T0⟧ ⟦T1⟧`）不会互相吞。
 *
 * 为什么要**单次扫描 + 回调**：
 *   旧实现按序号逐个 `replace`，尾部 `[_ \t]*_` 会跨越空白吃掉**下一个占位符**
 *   的开头，实测 `__T1__   __T0__` 被吞成 `词 T0__`。一次性扫出全部占位符
 *   （正则自带数字捕获）再回填，每个匹配都自包含。
 */
const PLACEHOLDER_RE = /⟦T(\d+)⟧|__T(\d+)__/g;

/**
 * 说明：译文里残留的占位符碎片（用于自检与报错，正常译文不应命中）。
 * 同时吞旧格式 `__T0__` 及其被拆散形态，保留历史缓存的检测能力。
 */
export function findLeftoverPlaceholders(text) {
  return String(text ?? '').match(/⟦T\d+⟧|_[ \t_]*T[ \t]*\d+[ \t_]*_/g) ?? [];
}

/**
 * 还原受保护的专有名词。
 *
 * 新格式 `⟦T0⟧`；同时兼容旧格式 `__T0__`（历史缓存里可能还有）。
 * 序号越界时保留原文，宁可展示占位符也不静默丢失原文。
 */
export function restoreTerms(text, tokens) {
  return String(text ?? '').replace(PLACEHOLDER_RE, (whole, a, b) => {
    const i = Number(a ?? b);
    return tokens[i] !== undefined ? tokens[i] : whole;
  });
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

/**
 * 术语表与人工修正：统一站内口径。
 *
 * ⚠️ 入参约定（被独立审查连续抓到两次的根因，务必遵守）：
 *   `text` 是**机器翻译的原始译文**（即 cache.zh.json 的值），
 *   而 `HUMAN_FIX` 的键是**英文原文**。因此查表必须用 `origin`（英文原文），
 *   不能拿译文去查 —— 那样永远落空，且不报错。
 *
 *   调用方（localizeText）手里同时有原文与译文，所以由它把 origin 传进来；
 *   直接调用 applyGlossary 时若不传 origin，则只做纯文本规整（术语表 + 人称 + 空格），
 *   不做人工修正 —— 这也让本函数在无原文场景下依然可安全使用。
 */
export function applyGlossary(text, origin) {
  let out = String(text ?? '').trim();
  // 人工修正：按英文原文查表（修正表登记的就是「原文 → 正确译文」）
  const key = origin === undefined ? undefined : cacheKey(origin);
  if (key !== undefined && HUMAN_FIX[key]) return finalize(HUMAN_FIX[key]);
  for (const [re, to] of TERM_MAP) out = out.replace(re, to);
  return finalize(out);
}

/** 收尾规整：人称统一 + 空格规整，顺序固定 */
function finalize(text) {
  return normalizeSpacing(unifyPerson(String(text ?? ''))).trim();
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
  // 顺序固定：先取机器译文，再把「英文原文」交给术语层做人工修正
  const zh = applyGlossary(translateWithCache(raw), raw);
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
