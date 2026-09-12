#!/usr/bin/env node
/**
 * Logo 抓取脚本：为每个空投项目下载真实的项目官方图标。
 *
 * 产出：
 *   1. public/logos/<slug>.<ext>      随仓库发布的图标文件
 *   2. data/logo-map.json             slug → 图标相对路径 的映射（供前端读取）
 *
 * 为什么把图标放进仓库而不是运行时直接引用外链：
 *   方案文档第 20 章要求「零服务器、纯静态、离线可用」。
 *   若前端直接引用 icons.llamao.fi / favicon 服务，
 *   一旦对方限流或挂掉，列表页就会整排变成破图 —— 这正是本次要修的问题。
 *
 * 为什么不用字母图 / 首字母兜底：
 *   本次需求明确要求「不出现缺省图或字母图」，
 *   因此脚本会对最终结果做硬校验：没有任何项目落在兜底上才算成功（见 verifyCoverage）。
 *
 * 用法：
 *   node scripts/logo/fetch-logos.mjs            # 增量抓取（已存在的图标跳过）
 *   node scripts/logo/fetch-logos.mjs --force    # 全部重新抓取
 */

import { mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import { faviconUrls, hostOf, isOfficialHost, llamaIconUrl } from './sources.mjs';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'public', 'logos');
const MAP_FILE = path.join(DATA_DIR, 'logo-map.json');
/** 抓取报告：落到 data/ 之外的临时位置，不进版本库 */
const REPORT_FILE = path.join(ROOT, '.cache', 'logo-report.json');

const SIZE = 128; // 展示尺寸统一 128×128，列表卡片 64px 下也清晰
const UA = 'Mozilla/5.0 (compatible; DropScopeLogoBot/1.0; +https://github.com/lanyuxi/kongtouxinxijuhe)';

/** 顺序执行 + 并发控制，避免把对方站点打爆 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function httpGet(url, { timeout = 15000 } = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
    headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/*
 * 图片格式嗅探（sniffImage）与占位图识别（isPlaceholderSvg）
 * 统一放在 sources.mjs：抓取脚本与单元测试必须用同一份实现，
 * 各写一份必然出现「测试通过但抓取时没拦住」的偏差。
 */
/**
 * 读出实际像素尺寸（同时用于识别 1×1 之类的僵尸图）。
 * 用 ffprobe 而不是 ffmpeg：ffmpeg 的 -select_streams 属于 ffprobe 选项，
 * 直接调 ffmpeg 会报 “Unrecognized option”，导致所有图片都被误判为不可解析。
 */
async function probeSize(file) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
      { timeout: 20000 },
    );
    const [w, h] = stdout.trim().split(',').map(Number);
    if (!w || !h) return null;
    return { w, h };
  } catch {
    return null;
  }
}

/** 统一下载后的处理：转成 128×128 PNG，保证前端零解码差异 */
async function toPng128(inputFile, outputFile) {
  await execFileAsync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-i', inputFile,
      '-vf', `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-frames:v', '1',
      outputFile,
    ],
    { timeout: 30000 },
  );
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

/**
 * 从一个候选文件里判断「是不是真的项目 logo」。
 * 判定失败会返回原因，便于报告里说清为什么换下一个来源。
 */
async function validateCandidate(tmpFile, buf, format) {
  if (!format) return { ok: false, reason: '不是图片格式' };
  if (format === 'svg') {
    const text = buf.toString('utf8');
    if (isPlaceholderSvg(text)) return { ok: false, reason: '生成式占位图（单字母）' };
    // SVG 交给 ffmpeg 前先落盘，尺寸检测对 SVG 不可靠，直接放行
    return { ok: true, format };
  }
  const size = await probeSize(tmpFile);
  if (!size) return { ok: false, reason: '无法解析图像尺寸' };
  if (size.w < 24 || size.h < 24) return { ok: false, reason: `尺寸过小 ${size.w}×${size.h}`, lowres: size };
  const ratio = size.w / size.h;
  if (ratio < 0.5 || ratio > 2) return { ok: false, reason: `宽高比异常 ${size.w}×${size.h}` };
  return { ok: true, format, size };
}

/**
 * 下载并校验一个候选 URL；通过后把结果（已转码的 PNG 或原 SVG）写回内存。
 * 说明：临时文件与并发无关（文件名带 slug），但仍要保证「清理」发生在读取之后。
 */
async function tryCandidate(url, slug, allowLowRes = false) {
  const tmpRaw = path.join(OUT_DIR, `.tmp-${slug}`);
  const tmpPng = path.join(OUT_DIR, `.tmp-${slug}.png`);
  try {
    const buf = await httpGet(url);
    const format = sniffImage(buf);
    if (!format) return { ok: false, reason: '响应不是图片（可能是域名占位页）' };
    await writeFile(tmpRaw, buf);
    const check = await validateCandidate(tmpRaw, buf, format);
    if (!check.ok) {
      // 低分辨率例外：只在人工登记过的项目上放行，且必须确实是「图片尺寸太小」
      if (!(allowLowRes && check.lowres)) return { ok: false, reason: check.reason };
    }
    if (format === 'svg') {
      // SVG 无法保证在构建环境里被 ffmpeg 渲染（部分镜像缺 rsvg），
      // 直接保留原文件，由前端 <img> 原样显示。
      return { ok: true, buffer: buf, ext: 'svg', url };
    }
    await toPng128(tmpRaw, tmpPng);
    return { ok: true, buffer: await readFile(tmpPng), ext: 'png', url };
  } catch (e) {
    return { ok: false, reason: (e instanceof Error ? e.message : String(e)).slice(0, 120) };
  } finally {
    await rm(tmpRaw, { force: true });
    await rm(tmpPng, { force: true });
  }
}

async function main() {
  const force = process.argv.includes('--force');
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.dirname(REPORT_FILE), { recursive: true });

  const dataset = JSON.parse(await readFile(path.join(DATA_DIR, 'airdrops.json'), 'utf8'));
  const profiles = JSON.parse(
    await readFile(path.join(DATA_DIR, 'seed', 'official-profiles.json'), 'utf8'),
  ).profiles ?? {};
  const mapping = JSON.parse(await readFile(path.join(__dirname, 'mapping.json'), 'utf8'));
  const manual = mapping.map ?? {};

  const existingMap = await readFile(MAP_FILE, 'utf8')
    .then((t) => JSON.parse(t))
    .catch(() => ({ logos: {} }));
  const existing = existingMap.logos ?? {};

  // 每个项目的信息：官网域名、人工档案（优先级高于抓取到的第三方链接）
  const projects = dataset.projects.map((p) => {
    const profileSite = profiles[p.slug]?.official?.website;
    const site = profileSite && isOfficialHost(hostOf(profileSite)) ? profileSite : p.official?.website;
    const manualDomain = manual[p.slug]?.domain;
    const host = manualDomain ?? (isOfficialHost(hostOf(site)) ? hostOf(site) : null);
    return { slug: p.slug, name: p.name, host, llama: manual[p.slug]?.llama ?? null };
  });

  const report = { generated_at: new Date().toISOString(), ok: [], fallback: [], failed: [] };
  const logos = {};

  await mapLimit(projects, 6, async (project) => {
    const { slug } = project;

    // 增量模式：已有图标且文件还在，直接复用
    if (!force && existing[slug]) {
      const rel = existing[slug];
      const file = path.join(OUT_DIR, path.basename(rel));
      if (await exists(file)) {
        logos[slug] = rel;
        report.ok.push({ slug, url: existingMap.sources?.[slug] ?? '(cached)', cached: true });
        return;
      }
    }

    const attempts = [];
    const candidates = [];
    if (project.llama) candidates.push(llamaIconUrl(project.llama));
    if (project.host) {
      // Lama 图标是 DefiLlama 维护的官方 logo 镜像，优先于 favicon
      candidates.push(llamaIconUrl(slug));
      if (project.llama) candidates.pop();
    }
    if (project.host) candidates.push(...faviconUrls(project.host));

    for (const url of candidates) {
      const r = await tryCandidate(url, slug, !!manual[slug]);
      if (r.ok) {
        const fileName = `${slug}.${r.ext}`;
        await writeFile(path.join(OUT_DIR, fileName), r.buffer);
        logos[slug] = `logos/${fileName}`;
        report.ok.push({ slug, name: project.name, url, ext: r.ext });
        return;
      }
      attempts.push(`${url} → ${r.reason}`);
    }

    report.failed.push({ slug, name: project.name, host: project.host, attempts });
  });

  // 清理孤立文件（改名 / 被 prune 掉的项目）
  const keep = new Set(Object.values(logos).map((v) => path.basename(v)));
  for (const f of await readdir(OUT_DIR)) {
    if (f.startsWith('.tmp-')) { await rm(path.join(OUT_DIR, f), { force: true }); continue; }
    if (!keep.has(f)) await rm(path.join(OUT_DIR, f), { force: true });
  }

  const sortedLogos = Object.fromEntries(Object.keys(logos).sort().map((k) => [k, logos[k]]));
  const sources = Object.fromEntries(report.ok.map((r) => [r.slug, r.url]));
  const out = {
    _comment:
      '项目官方 logo 映射（由 scripts/logo/fetch-logos.mjs 生成）。图标文件位于 public/logos/，随仓库发布，前端不依赖任何外部图床。',
    updated_at: new Date().toISOString(),
    total: Object.keys(sortedLogos).length,
    logos: sortedLogos,
    sources,
  };
  await writeFile(MAP_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[logo] 成功 ${report.ok.length} / ${projects.length}，失败 ${report.failed.length}`);
  if (report.failed.length) {
    console.log('[logo] 未拿到图标的项目：');
    for (const f of report.failed) {
      console.log(`  ✗ ${f.slug}（${f.host ?? '无官网'}）`);
      f.attempts.slice(0, 3).forEach((a) => console.log(`      ${a}`));
    }
  }
  if (report.failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[logo] 失败：', e);
  process.exitCode = 1;
});
