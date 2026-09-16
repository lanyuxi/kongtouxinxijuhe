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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectTerms, restoreTerms, hasChinese } from './translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_FILE = path.join(ROOT, 'scripts/i18n/cache.zh.json');
const DETAILS = path.join(ROOT, 'data/details');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 收集当前数据里所有「面向用户且仍是英文」的文案 */
function collectTexts() {
  const out = new Set();
  let files = [];
  try {
    files = [];
    for (const f of require('node:fs').readdirSync(DETAILS)) {
      if (f.endsWith('.json')) files.push(f);
    }
  } catch {
    return [];
  }
  for (const f of files) {
    let p;
    try {
      p = JSON.parse(readFileSync(path.join(DETAILS, f), 'utf8'));
    } catch {
      continue;
    }
    for (const s of p.sourcedSteps ?? []) {
      if (s.title && !hasChinese(s.title)) out.add(s.title);
      if (s.body && !hasChinese(s.body)) out.add(s.body);
    }
    if (p.tagline && !hasChinese(p.tagline)) out.add(p.tagline);
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

main().catch((e) => {
  console.error('[i18n] 异常：', e);
  process.exitCode = 1;
});
