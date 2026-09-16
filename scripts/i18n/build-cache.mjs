#!/usr/bin/env node
/**
 * 生成教程中文化的机器翻译缓存（离线准备步骤，只跑一次）。
 *
 * 为什么要把译文提交进仓库，而不是每次构建都实时翻译：
 *   1. 构建期（含每 10 分钟的定时抓取）不能依赖第三方翻译服务 ——
 *      对方限流或被墙会导致站点文案时好时坏，属于不可接受的不确定性；
 *   2. 译文进仓库后可以被 review：错译、术语不当在 PR 阶段就能发现；
 *   3. 同一段英文永远得到同一段中文，可复现、可测试。
 *
 * 用法：
 *   node scripts/i18n/build-cache.mjs            # 只翻译缓存里缺失的条目
 *   node scripts/i18n/build-cache.mjs --report   # 只统计缺口，不发起请求
 *
 * 注意：本脚本**不参与** CI / 定时流水线，只在人工需要补译文时执行。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectTerms, restoreTerms, hasChinese } from './translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_FILE = path.join(ROOT, 'scripts/i18n/cache.zh.json');
const DETAILS = path.join(ROOT, 'data/details');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 收集当前数据里所有「面向用户且仍是英文」的文案。
 *
 * ⚠️ 两个真实故障（独立审查实测，本脚本曾整体失效）：
 *
 *   1. **`require` 在 ESM 里不存在**：本文件是 `.mjs`，package.json 是
 *      `"type": "module"`，`require('node:fs')` 直接抛 `ReferenceError`。
 *      改用已 import 的 `readdirSync`。
 *
 *   2. **裸 `catch` 把错误吞掉**（这才是真正的病根）：
 *      旧写法 `try { ... } catch { return [] }` 让上面的 ReferenceError
 *      变成「语料为空」，脚本于是永远打印「缺失 0 条」——
 *      任何人按文档来补译，都会得到「无缺口」的结论。
 *      实测修正后从「缺失 0 条」变为「缺失 736 条」，
 *      而 issue #28 的 47 处错译正是这样错过了一轮。
 *      现在 catch 必须**打印原因**，不允许静默回退。
 */
/**
 * 把「被截断的英文原文」还原成缓存里的完整键。
 *
 * ⚠️ 为什么需要这一步（独立审查 P2 实测）：
 *   `data/details/*.json` 里的 `original_description` 被
 *   `truncateAtSentence(..., 400)` 截到 400 字，而缓存键是**完整原文**
 *   （例：键 427 字 vs 落盘 400 字），两边永远对不上 ——
 *   脚本于是报「缺失 22 条」，而这 22 条其实**缓存里都有**。
 *   后果不是用户可见 bug（`localizeCarriedOver` 优先用已中文化的
 *   `description`），但补译脚本会把**已存在的译文重复再翻一遍**，
 *   且报告数字失真，掩盖真实缺口。
 *
 * 做法：用 400 字前缀建反查索引（实测 738 条键前缀零冲突）。
 * 只在「原文长度 >= 400」时启用，避免短句误配。
 */
const TRUNCATE_LEN = 400;

function buildFullKeyIndex() {
  if (!existsSync(CACHE_FILE)) return new Map();
  let cache;
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    console.error(`[i18n] ✗ 读取缓存失败，无法建反查索引：${e.message}`);
    return new Map();
  }
  const index = new Map();
  for (const key of Object.keys(cache)) {
    if (key.length < TRUNCATE_LEN) continue;
    const prefix = key.slice(0, TRUNCATE_LEN);
    if (index.has(prefix) && index.get(prefix) !== key) {
      console.error(`[i18n] ✗ 反查索引前缀冲突，请人工确认：${prefix.slice(0, 40)}…`);
      return new Map();
    }
    index.set(prefix, key);
  }
  return index;
}

/** 把可能被截断的文案还原为缓存里的完整键 */
function resolveFullKey(text, index) {
  if (!text) return text;
  if (index.has(text)) return index.get(text);
  if (text.length >= TRUNCATE_LEN) {
    const hit = index.get(text.slice(0, TRUNCATE_LEN));
    if (hit) return hit;
  }
  return text;
}

export function collectTexts() {
  const out = new Set();
  const fullKeyIndex = buildFullKeyIndex();
  let files = [];
  try {
    files = readdirSync(DETAILS).filter((f) => f.endsWith('.json'));
  } catch (e) {
    console.error(`[i18n] ✗ 读取 data/details 失败，补译语料为空：${e.message}`);
    console.error('[i18n]   这会导致下面的「缺失 0 条」是假象，请先修目录问题。');
    return [];
  }
  if (files.length === 0) {
    console.error(`[i18n] ✗ ${DETAILS} 下没有 .json 分片，语料为空（目录或流水线异常）`);
    return [];
  }
  for (const f of files) {
    let p;
    try {
      p = JSON.parse(readFileSync(path.join(DETAILS, f), 'utf8'));
    } catch {
      continue;
    }
    /**
     * ⚠️ 必须读 `tagline_en`（英文原文），不能读 `tagline`。
     *
     * 历史事故（真实踩过）：`tagline` 在落盘时已经是中文译文，
     * 于是 `!hasChinese(p.tagline)` 恒为 false，**一句话简介永远不会被补译** ——
     * 59 个项目因此长期显示英文，且脚本报告「0 条缺失」，毫无线索。
     * 教程步骤同理：`original_title` / `original_description` 才是英文原文。
     */
    // 教程步骤：`sourcedSteps` 落盘时就是英文原文（未本地化），
    // 而 `guide` 已本地化、英文原文挂在 `original_*` 上。两者都收，
    // 保证「首次补译」与「重新生成缓存」都能收齐。
    for (const s of p.sourcedSteps ?? []) {
      if (s.title && !hasChinese(s.title)) out.add(resolveFullKey(s.title, fullKeyIndex));
      if (s.body && !hasChinese(s.body)) out.add(resolveFullKey(s.body, fullKeyIndex));
    }
    for (const g of p.guide ?? []) {
      if (g.original_title) out.add(resolveFullKey(g.original_title, fullKeyIndex));
      if (g.original_description) out.add(resolveFullKey(g.original_description, fullKeyIndex));
    }
    if (p.tagline_en) out.add(p.tagline_en);
    else if (p.tagline && !hasChinese(p.tagline)) out.add(p.tagline);
  }
  return [...out];
}

async function translateChunk(chunk) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=zh-CN&dt=t&q=' +
    encodeURIComponent(chunk);
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const json = await res.json();
  if (!Array.isArray(json?.[0])) throw new Error('翻译接口返回结构异常');
  return json[0].map((x) => x[0]).join('');
}

async function translate(text) {
  const { text: protectedText, tokens } = protectTerms(text);
  const parts = protectedText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const part of parts) {
    if ((cur + ' ' + part).trim().length <= 1200) cur = (cur ? cur + ' ' : '') + part;
    else {
      if (cur) chunks.push(cur);
      cur = part;
    }
  }
  if (cur) chunks.push(cur);
  const out = [];
  for (const c of chunks) {
    out.push(await translateChunk(c));
    await sleep(250);
  }
  return restoreTerms(out.join(''), tokens);
}

async function main() {
  const report = process.argv.includes('--report');
  const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  const texts = collectTexts();
  const missing = texts.filter((t) => !cache[t] || !hasChinese(cache[t]));
  console.log(`[i18n] 待覆盖文案 ${texts.length} 条，缓存命中 ${texts.length - missing.length} 条，缺失 ${missing.length} 条`);
  if (report || missing.length === 0) return;

  let n = 0;
  for (const t of missing) {
    try {
      const zh = await translate(t);
      if (hasChinese(zh)) cache[t] = zh;
    } catch (e) {
      console.warn(`[i18n] 翻译失败，跳过：${String(e.message).slice(0, 80)}`);
    }
    n++;
    if (n % 20 === 0) {
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1) + '\n', 'utf8');
      console.log(`[i18n] 进度 ${n}/${missing.length}`);
    }
  }
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  writeFileSync(CACHE_FILE, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
  console.log(`[i18n] 完成，缓存共 ${Object.keys(sorted).length} 条`);
}

/**
 * ⚠️ 只在「作为脚本直接执行」时才跑 main()。
 *
 * 否则测试 `import` 本模块做护栏校验时，会顺带触发一次真实翻译请求
 * （打第三方接口、还可能需要写文件），既慢又不该发生在单测里。
 * 判断方式：`import.meta.url` 是否等于入口脚本 —— 这是 ESM 的标准写法。
 */
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((e) => {
    console.error('[i18n] 异常：', e);
    process.exitCode = 1;
  });
}
