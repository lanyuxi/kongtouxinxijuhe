/**
 * 独立校验脚本：可接入 CI，作为发布前的质量门禁。
 *
 * 用法：npm run validate
 */

import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AirdropProject } from '../src/lib/types';
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

/**
 * 读取全部**完整项目**用于校验。
 *
 * ⚠️ 为什么不能读 data/airdrops.json：
 *   它现在是瘦身后的**列表形态**（见 scripts/lib/list.ts），没有 evidence / guide / faq。
 *   而校验逻辑恰好全部依赖这些字段（证据条数、教程可追溯性、logo 覆盖等）。
 *   历史事故：列表瘦身后这里仍读 airdrops.json，
 *   结果 `p.evidence.filter(...)` 直接抛 `Cannot read properties of undefined`，
 *   让 GitHub Pages 的「发布前校验」整步失败、部署被跳过。
 *   完整项目的唯一可信来源是 data/details/。
 */
async function readFullProjects(dir: string): Promise<AirdropProject[]> {
  const out: AirdropProject[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const p = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as AirdropProject;
      if (p?.slug) out.push(p);
    } catch {
      /* 单个分片损坏不阻断整体校验，交由上层统计 */
    }
  }
  return out;
}

/**
 * 读取人工档案登记的 slug（data/seed/official-profiles.json）。
 *
 * 这份名单是「人工确认过是真实空投项目」的记录，
 * 非空投条目门禁必须认它 —— 否则像 `Gate`（既是交易所也是项目池）
 * 这类边界情况会被一刀切掉，属于误杀。
 */
async function loadProfileSlugs(): Promise<Set<string>> {
  try {
    const raw = await readFile(path.join(ROOT, 'data', 'seed', 'official-profiles.json'), 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown> | { profiles?: Record<string, unknown> };
    const keys =
      data && typeof data === 'object' && 'profiles' in data && data.profiles
        ? Object.keys(data.profiles as Record<string, unknown>)
        : Object.keys(data ?? {});
    return new Set(keys);
  } catch {
    // 没有档案文件时返回空集合：门禁照常生效，不做任何豁免
    return new Set();
  }
}

async function main() {
  // 校验对象是完整项目（来自 details/），而不是瘦身后的列表（见 readFullProjects 注释）
  const projects = await readFullProjects(path.join(ROOT, 'data', 'details'));
  if (projects.length === 0) {
    console.log('\n错误 1 条：\n  ✗ 未找到任何项目详情（data/details/ 为空）');
    process.exitCode = 1;
    return;
  }

  // 人工档案：命中排除规则但已人工核实为真实空投项目的豁免名单。
  // 不传则门禁对所有条目一律生效（不豁免任何东西）。
  const profiles = await loadProfileSlugs();
  const result = validateProjects(projects, profiles);

  // 额外检查：真实性分 >= 70 的项目应至少满足「已验证」门槛
  const suspicious = projects.filter(
    (p: AirdropProject) => p.scores.authenticity >= 70 && !isProjectVerified(p),
  );

  // 扫描前端源码中的 Secret（不变量 5）
  const secrets = scanForSecrets(await collectSourceFiles(path.join(ROOT, 'src')));

  const errors = [...result.errors, ...secrets.map((s) => `Secret 泄漏：${s}`)];
  const warnings = [...result.warnings];

  // Logo 覆盖率校验：列表页不允许出现缺省图 / 字母图。
  // 校验对象是 data/logo-map.json 与实际文件是否一一对应，
  // 而不是「抓取脚本跑了没」—— 只有文件真的存在，前端才不会破图。
  const logoErrors = await validateLogoCoverage(projects, warnings);
  errors.push(...logoErrors);

  console.log(`\n数据集：${projects.length} 个项目（完整详情分片）`);
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

  /**
   * 已在 scripts/logo/mapping.json 的 _blocked 中登记为「无法自动抓取」的项目。
   *
   * 为什么发布门禁也要认这份登记（2026-09-15 的真实事故）：
   *   beezie 的官网由 Cloudflare 托管，对数据中心 IP（CI runner）返回 403，
   *   住宅网络放行。于是「本地能抓、CI 抓不到」。
   *   若门禁仍按「有图标才放行」，就会把一个第三方站点的反爬策略升级成
   *   整站发布失败 —— 从 2026-09-14T11:42 起 Deploy 与 Refresh Data 连续 100% 失败。
   *
   *   门禁的本意是「防止漏抓图标导致页面出现空白位」。对于已如实登记、
   *   且核实过原因（对方主动拒绝，非本方脚本故障）的项目，应当告警而非拦发布。
   *   未登记的项目一旦缺图，下面仍然直接报错 —— 门禁没有被削弱。
   */
  let blocked = new Set<string>();
  try {
    const mapping = JSON.parse(
      await readFile(path.join(ROOT, 'scripts', 'logo', 'mapping.json'), 'utf8'),
    ) as { _blocked?: Record<string, unknown> };
    blocked = new Set(Object.keys(mapping._blocked ?? {}));
  } catch {
    // mapping.json 缺失时按「没有任何豁免」处理，宁严勿松
  }

  for (const p of projects) {
    if (blocked.has(p.slug)) {
      warnings.push(`${p.slug}：已登记为「无法自动抓取」，列表页不会有图标（见 scripts/logo/mapping.json 的 _blocked）`);
      continue;
    }
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
