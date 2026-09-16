#!/usr/bin/env node
/**
 * 人工修正表体检脚本。
 *
 * 背景（独立审查 P1-1 的真实事故）：
 *   HUMAN_FIX 曾登记 32 条修正，但键按「另一次生成的译文」写入，
 *   与 cache.zh.json 里的实际文本完全对不上 —— 命中 0 条，
 *   整张表是死代码，错译因此一路活到了线上，且没有任何报错。
 *
 * 本脚本做两件事：
 *   1. 校验：每条 HUMAN_FIX 的键是否真实命中缓存（查表形态 = applyGlossary 的入参）；
 *   2. 体检：扫描当前缓存里仍疑似错译的条目，并打印可直接粘贴的键值，
 *      便于人工登记（键必须是**缓存原始译文**，即 applyGlossary 的入参）。
 *
 * 用法：
 *   node scripts/i18n/check-human-fix.mjs           # 校验 + 体检
 *   node scripts/i18n/check-human-fix.mjs --strict  # 校验失败时以非 0 退出（CI 用）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUMAN_FIX } from './glossary.mjs';
import { loadCache, localizeText } from './translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8'));

/**
 * 判定一条修正是否「真实生效」。
 *
 * ⚠️ 关键：查表发生在 applyGlossary 内部，入参是**缓存原始译文**。
 *    因此必须直接用 `cache[键]` 判断，而不是先自己跑一遍 applyGlossary
 *    再去找键 —— 那样得到的是「已修正后的文本」，永远找不到键
 *    （这正是我第一次写体检脚本时踩的坑，会把有效修正误报成失效）。
 */
export function auditHumanFix(cache, fixes, localize) {
  const total = Object.keys(fixes).length;
  // 键必须命中缓存（= 必须是真实存在的英文原文）
  const missing = Object.keys(fixes).filter((k) => cache[k] === undefined);
  /**
   * 端到端有效性：localizeText(英文原文) 必须等于登记的修正值。
   *
   * 只检查「键存在」是不够的 —— 实测出现过「键存在但修正不生效」：
   * applyGlossary 拿译文去查英文键，永远落空，
   * 而「键命中」检查全绿。两次被同一类缺陷绕过，因此这里改成端到端验证。
   */
  const ineffective = localize
    ? Object.entries(fixes)
        .filter(([k, v]) => localize(k) !== v)
        .map(([k]) => k)
    : [];
  return { total, effective: total - ineffective.length, missing, ineffective };
}

/** 仍疑似错译的条目：只用于体检提示，不做自动修正（避免误改正确译文） */
const SUSPECT = [
  /您/,
  /宝石/,
  /奖励部分/,
  // 「认领」本身是合法中文，只有跟在「索赔 / 认领 + 门户」这类机器翻译搭配里才是错译。
  // 直接匹配裸词会把已修正文本（`确认领取交易`）误报成错译，
  // 因此限定为固定搭配。
  /认领(入口|门户|页|申请)/,
  /选项卡/,
  /小部件/,
  /燃料/,
  /入住/,
  /登机/,
  /索赔/,
  /自保/,
  /桥接/,
  /令牌/,
  /返利/,
  /币安/,
  /背包/,
  /坎布里亚/,
  /多普勒/,
  /价值链/,
  /任务板/,
  /卷轴/,
  /航站楼/,
  /燃气的/,
  /朝圣者/,
  // 货币符号后跟空格 = 代币符号被译坏（`$ 卡`、`$ 张卡片`）的头号特征
  /\$\s/,
];

function main() {
  const strict = process.argv.includes('--strict');
  loadCache(CACHE);
  const { total, effective, missing, ineffective } = auditHumanFix(
    CACHE,
    HUMAN_FIX,
    (en) => localizeText(en).zh,
  );

  console.log(`[human-fix] 修正表共 ${total} 条，端到端生效 ${effective} 条`);
  if (missing.length) {
    console.log('[human-fix] ✗ 以下键在缓存中不存在（不是任何真实英文原文）：');
    for (const k of missing) console.log(`    ${JSON.stringify(k)}`);
  }
  if (ineffective.length) {
    console.log('[human-fix] ✗ 以下修正已登记但**未生效**（localizeText 结果与登记值不一致）：');
    for (const k of ineffective) console.log(`    ${JSON.stringify(k)}`);
  }

  // 已登记为 HUMAN_FIX 的英文原文，其对应译文会被自动修正，
  // 因此不再重复提示 —— 否则会把「待修正的机器译文」刷成噪音，
  // 反而掩盖真正尚未处理的错译。
  const pending = new Set(Object.keys(HUMAN_FIX).map((k) => CACHE[k]).filter(Boolean));
  const suspects = Object.entries(CACHE).filter(
    ([, zh]) => !pending.has(zh) && SUSPECT.some((re) => re.test(zh)),
  );
  if (suspects.length) {
    console.log(`\n[human-fix] 提示：缓存中仍有 ${suspects.length} 条疑似错译，可考虑登记修正`);
    for (const [en, zh] of suspects.slice(0, 30)) {
      console.log(`    键：${JSON.stringify(zh)}`);
      console.log(`    原文：${en.slice(0, 90)}`);
    }
  }

  const failed = missing.length > 0 || ineffective.length > 0 || effective === 0;
  if (failed) {
    console.log('\n[human-fix] 结论：不通过（修正表已失效，需按上面打印的键重新登记）');
    if (strict) process.exitCode = 1;
  } else {
    console.log('\n[human-fix] 结论：通过');
  }
}

main();
