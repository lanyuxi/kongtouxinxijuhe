/**
 * 独立校验脚本：可接入 CI，作为发布前的质量门禁。
 *
 * 用法：npm run validate
 */

import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AirdropProject, Dataset } from '../src/lib/types';
import { validateProjects, scanForSecrets } from './lib/validate';
import { isProjectVerified } from './lib/verify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function collectSourceFiles(dir: string): Promise<{ file: string; content: string }[]> {
  const out: { file: string; content: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectSourceFiles(full)));
    } else if (/\.(ts|tsx|css|html)$/.test(e.name)) {
      out.push({ file: path.relative(ROOT, full), content: await readFile(full, 'utf8') });
    }
  }
  return out;
}

async function main() {
  const dataset = JSON.parse(
    await readFile(path.join(ROOT, 'data/airdrops.json'), 'utf8'),
  ) as Dataset;

  const result = validateProjects(dataset.projects);

  // 额外检查：真实性分 >= 70 的项目应至少满足「已验证」门槛
  const suspicious = dataset.projects.filter(
    (p: AirdropProject) => p.scores.authenticity >= 70 && !isProjectVerified(p),
  );

  // 扫描前端源码中的 Secret（不变量 5）
  const secrets = scanForSecrets(await collectSourceFiles(path.join(ROOT, 'src')));

  const errors = [...result.errors, ...secrets.map((s) => `Secret 泄漏：${s}`)];
  const warnings = [...result.warnings];

  // Logo 覆盖率校验：列表页不允许出现缺省图 / 字母图。
  // 校验对象是 data/logo-map.json 与实际文件是否一一对应，
  // 而不是「抓取脚本跑了没」—— 只有文件真的存在，前端才不会破图。
  const logoErrors = await validateLogoCoverage(dataset.projects, warnings);
  errors.push(...logoErrors);

  console.log(`\n数据集：${dataset.projects.length} 个项目`);
  console.log(`校验通过：${result.ok && errors.length === 0 ? '是' : '否'}`);
  if (warnings.length) {
    console.log(`\n警告 ${warnings.length} 条：`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
  if (suspicious.length) {
    console.log(`\n提示：${suspicious.length} 个项目真实性分较高但未达「已验证」门槛（可接受，需人工复核）`);
  }
  if (errors.length) {
    console.log(`\n错误 ${errors.length} 条：`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    process.exitCode = 1;
  } else {
    console.log('\n✓ 全部检查通过');
  }
}

/**
 * 校验每个项目都有真实、可用的 logo 文件。
 *
 * 为什么作为发布门禁：一旦某个项目漏抓图标，
 * 前端会退化成「文字块 / 缺省图」，正是本次需求要消除的情况。
 * 因此在 CI 里直接拒绝发布，而不是等用户看到破图。
 */
async function validateLogoCoverage(projects: AirdropProject[], warnings: string[]): Promise<string[]> {
  const errors: string[] = [];
  const mapFile = path.join(ROOT, 'data', 'logo-map.json');
  let map: { logos?: Record<string, string> } | null = null;
  try {
    map = JSON.parse(await readFile(mapFile, 'utf8'));
  } catch {
    errors.push('缺少 data/logo-map.json：无法确认 logo 覆盖率，请先执行 npm run logos');
    return errors;
  }
  const logos = map?.logos ?? {};
  const missing: string[] = [];
  const broken: string[] = [];

  for (const p of projects) {
    const rel = logos[p.slug];
    if (!rel) {
      missing.push(p.slug);
      continue;
    }
    const file = path.join(ROOT, 'public', rel);
    try {
      await access(file);
      const info = await stat(file);
      if (info.size < 200) broken.push(`${p.slug}（文件过小 ${info.size}B，疑似占位图）`);
    } catch {
      broken.push(`${p.slug}（文件不存在：${rel}）`);
    }
  }

  if (missing.length) {
    errors.push(`以下项目缺少 logo 映射，会导致列表页出现缺省图：${missing.join('、')}`);
  }
  if (broken.length) {
    errors.push(`以下项目的 logo 文件不可用：${broken.join('、')}`);
  }
  const extra = Object.keys(logos).filter((slug) => !projects.some((p) => p.slug === slug));
  if (extra.length) {
    warnings.push(`logo-map.json 中存在已下架项目的残留条目：${extra.join('、')}`);
  }
  return errors;
}

main().catch((e) => {
  console.error('校验脚本异常：', e);
  process.exitCode = 1;
});
