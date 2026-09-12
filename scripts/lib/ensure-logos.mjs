#!/usr/bin/env node
/**
 * 构建期图标兜底：保证「构建产物里的图标覆盖率 = 数据里的项目数」。
 *
 * 为什么需要它（这是本次线上事故的第二道防线）：
 *   图标抓取（scripts/logo/fetch-logos.mjs）依赖外网，而抓取发生在数据落盘之后。
 *   一旦它静默失败（数据库里多了一个新项目、但图标没抓到），
 *   `npm run build` 依旧会成功，线上就会出现「有数据没图标」的空白方块。
 *
 *   与其在 CI 里靠人盯着日志，不如把「补图」直接挂进构建链路：
 *   构建前先检查，缺图就先跑一次图标抓取；仍然缺失才让构建失败。
 *
 * 与 validate 的分工：
 *   - validate（发布前校验）负责回答「数据能不能发布」；
 *   - 本脚本负责回答「构建产物能不能完整展示」。
 *   两者都失败才算真的有问题，任何一道不过都不允许产出站点。
 *
 * 用法：node scripts/lib/ensure-logos.mjs
 */

import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATASET = path.join(ROOT, 'data/airdrops.json');
const MAP = path.join(ROOT, 'data/logo-map.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** 返回「映射里有、但文件不存在」以及「映射里没有」的 slug 列表 */
export async function findMissingLogos() {
  const dataset = await readJson(DATASET, { projects: [] });
  const map = await readJson(MAP, { logos: {} });
  const logos = map.logos ?? {};

  const missing = [];
  for (const p of dataset.projects ?? []) {
    const rel = logos[p.slug];
    if (!rel) {
      missing.push(p.slug);
      continue;
    }
    try {
      await access(path.join(ROOT, 'public', rel));
    } catch {
      missing.push(p.slug);
    }
  }
  return missing;
}

// 被 import 时只导出函数，不做副作用；直接执行时才跑检查
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const missing = await findMissingLogos();
  if (missing.length === 0) {
    console.log('[ensure-logos] ✓ 图标齐全，无需补齐');
  } else {
    console.log(`[ensure-logos] 发现 ${missing.length} 个项目缺图标，尝试抓取补齐…`);
    const run = spawnSync(process.execPath, ['scripts/logo/fetch-logos.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    const still = await findMissingLogos();
    if (still.length) {
      console.error(
        `[ensure-logos] ✗ 仍有 ${still.length} 个项目没有图标：${still.join('、')}`,
      );
      console.error('[ensure-logos] 继续构建会产出带有空白图标位的站点，已中断。');
      console.error('[ensure-logos] 处理方式：检查网络后重跑，或在 scripts/logo/mapping.json 补登记官方域名。');
      process.exit(run.status || 1);
    }
    console.log(`[ensure-logos] ✓ 已补齐 ${missing.length} 个图标`);
  }
}
