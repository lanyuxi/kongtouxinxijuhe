#!/usr/bin/env node
/**
 * Logo 抓取脚本：为每个空投项目下载真实的项目官方图标。
 *
 * 产出：
 *   1. public/logos/<slug>.<ext>      随仓库发布的图标文件
 *   2. data/logo-map.json             slug → 图标相对路径 的映射（供前端读取）
 *
 * 头号铁律（这条规则来自一次真实事故）：
 *   **已经成功抓到过的图标，绝不允许因为「本轮抓取失败」而被删除或从映射里摘掉。**
 *   事故经过：图标抓取发生在数据落盘之后，而本轮抓取用的数据里含有旧项目
 *   （Last Known Good），旧项目在旧数据上可能压根没有官网 / 可用域名，
 *   于是候选 URL 全部失败 → 旧实现把它当成「孤儿图标」直接 rm 掉，
 *   并把 slug 从 logo-map.json 里删掉。用户点一次「一键更新」，刷新两轮之后
 *   整站图标就全没了（映射表不会撒谎：新项目不可能在几秒内冒出来）。
 *   现在改为：本轮失败时**保留已有文件与映射**，只有确认项目真的从数据集里
 *   消失、且该文件不是任何项目的图标时才清理。
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
 * 运行环境要求：**零外部二进制依赖**。
 *   尺寸解析走文件头自解析（image-size.mjs），
 *   ffmpeg 只用于把非 PNG 缩放到 128×128，缺失时自动降级为原样保存。
 *   这样 CNB / GitHub Actions 的 node:22 镜像（不含 ffmpeg）也能正常跑完，
 *   不会因为「构建机少装一个二进制」把整条发布链路拖停。
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
import { faviconUrls, hostOf, isOfficialHost, isPlaceholderSvg, llamaIconUrl, sniffImage } from './sources.mjs';
import { imageSize } from './image-size.mjs';

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

/**
 * 带重试的下载。
 *
 * 为什么需要重试（2026-09-15 的一次线上部署失败）：
 *   GitHub Actions 上的 `npm run logos` 在没有本地缓存的新环境里必须真实联网。
 *   图标来源（third-party 图床）偶发 5xx / 连接重置时，单次失败就会让
 *   整个部署 step 以非 0 退出 —— 后面的单测、校验、构建、发布全部被跳过，
 *   站点因此停留在旧版本，而日志里只会显示「抓取项目 Logo 失败」。
 *
 *   抓取失败本不该阻断「发布一个已经正确的构建」。所以这里对**网络类错误**
 *   做有限次退避重试；仍然失败时按原逻辑留给覆盖率守卫处理
 *   （有旧图标则沿用，确实缺图才让流程失败）。
 */
async function httpGet(url, { timeout = 15000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
      });
      // 4xx 是「这个 URL 本身不行」，重试没有意义，直接换下一个候选源；
      // 5xx / 429 属于对方临时故障，值得退避后再试一次。
      if (!res.ok) {
        const retriable = res.status >= 500 || res.status === 429;
        if (!retriable) throw new Error(`HTTP ${res.status}`);
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error('下载失败');
}

/*
 * 图片格式嗅探（sniffImage）与占位图识别（isPlaceholderSvg）
 * 统一放在 sources.mjs：抓取脚本与单元测试必须用同一份实现，
 * 各写一份必然出现「测试通过但抓取时没拦住」的偏差。
 */
/**
 * 读出实际像素尺寸（同时用于识别 1×1 之类的僵尸图）。
 *
 * 实现方式：直接从文件头解析（scripts/logo/image-size.mjs），**不再依赖 ffprobe**。
 *
 * 为什么必须改（2026-09-15 线上部署失败的真正根因）：
 *   CI 的 `node:22` 镜像里没有 ffmpeg。原实现调 `ffprobe` 读尺寸，
 *   命令不存在 → 子进程报错 → 被 catch 吞成 null → 每个候选图标都被判成
 *   「无法解析图像尺寸」→ 189 个项目全部抓不到图标 + `npm run logos` 非 0 退出。
 *
 *   这一点非常容易被误判成「图床抖动」：错误文案是「无法解析图像尺寸」，
 *   看起来像图片坏了；而本机（装了 ffmpeg）跑 `--force` 又是 188/189 成功，
 *   于是「本地好的、CI 不好」看上去像网络问题。
 *   实际上是**与网络无关的 100% 必然失败**：换任何一台没装 ffmpeg 的机器都一样。
 *   （注意：beezie 确实另有 Cloudflare 反爬问题，见 mapping.json 的 _blocked，
 *    但那只是 1 个项目；这里说的是「全部项目都失败」这一类。）
 *
 *   尺寸信息本来就在文件头里：自解析零依赖、可离线、可测试，
 *   也不会因为「构建机少装一个二进制」就把整条发布链路拖停。
 */
async function probeSize(buf, format) {
  if (!format) return null;
  return imageSize(buf, format);
}

/**
 * 构建机是否装了 ffmpeg —— 只在第一次询问时探测一次。
 *
 * 为什么必须探测而不是直接调用（这是另一半原因）：
 *   `node:22` 官方镜像不含 ffmpeg。原实现无条件调用它做 128×128 转码，
 *   于是即使尺寸校验通过，也会在转码时变成「spawn ffmpeg ENOENT」→ 判为失败。
 *   换成「探测 + 可降级」后，构建机有没有 ffmpeg 都不再影响发布。
 */
let ffmpegAvailable = null;
async function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 10000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    console.warn(
      '[logo] 未检测到 ffmpeg，将直接保存原始图标（不做 128×128 转码）。' +
        '展示尺寸由前端 <img> 统一约束，不影响视觉一致性。',
    );
  }
  return ffmpegAvailable;
}

/**
 * 统一下载后的处理：优先转成 128×128 PNG。
 *
 * 无 ffmpeg 时**降级为原样保存**，而不是让下载失败：
 *   图标尺寸只是展示层的统一约定，前端本来就按 64px 渲染，
 *   不该因为构建机少装一个二进制就把所有项目判成「抓取失败」。
 *   （原生格式 PNG / WebP / ICO / JPEG 浏览器全都能直接显示。）
 */
async function toPng128(inputFile, outputFile, format) {
  if (format === 'png') {
    // PNG 无需转码即可直接用；只有要缩放的才需要 ffmpeg
    const size = imageSize(await readFile(inputFile), 'png');
    if (size && size.w <= SIZE * 2 && size.h <= SIZE * 2) {
      await writeFile(outputFile, await readFile(inputFile));
      return { ext: 'png', transcoded: false };
    }
  }
  if (!(await hasFfmpeg())) {
    return { ext: format, transcoded: false };
  }
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
  return { ext: 'png', transcoded: true };
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

/**
 * 从一个候选文件里判断「是不是真的项目 logo」。
 * 判定失败会返回原因，便于报告里说清为什么换下一个来源。
 */
async function validateCandidate(buf, format) {
  if (!format) return { ok: false, reason: '不是图片格式' };
  if (format === 'svg') {
    const text = buf.toString('utf8');
    if (isPlaceholderSvg(text)) return { ok: false, reason: '生成式占位图（单字母）' };
    // SVG 交给 ffmpeg 前先落盘，尺寸检测对 SVG 不可靠，直接放行
    return { ok: true, format };
  }
  const size = await probeSize(buf, format);
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
    const check = await validateCandidate(buf, format);
    if (!check.ok) {
      // 低分辨率例外：只在人工登记过的项目上放行，且必须确实是「图片尺寸太小」
      if (!(allowLowRes && check.lowres)) return { ok: false, reason: check.reason };
    }
    if (format === 'svg') {
      // SVG 无法保证在构建环境里被 ffmpeg 渲染（部分镜像缺 rsvg），
      // 直接保留原文件，由前端 <img> 原样显示。
      return { ok: true, buffer: buf, ext: 'svg', url };
    }
    const out = await toPng128(tmpRaw, tmpPng, format);
    return {
      ok: true,
      buffer: await readFile(out.transcoded ? tmpPng : tmpRaw),
      ext: out.ext ?? 'png',
      url,
    };
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

  const report = { generated_at: new Date().toISOString(), ok: [], kept: [], failed: [] };
  const logos = {};
  // 沿用旧图标时，来源记录也要一起沿用 —— 否则 logo-map.json 的 sources 会一轮轮被掏空，
  // 事后想复核「这张图是从哪儿来的」就查不到了。
  const carriedSources = {};

  await mapLimit(projects, 6, async (project) => {
    const { slug } = project;

    // 第一步：旧文件如果还在，无论如何先认定为「已拥有」。
    // 注意顺序 —— 必须在抓取之前绑定，这样即使本轮抓取失败，
    // 后面的清理逻辑也会因为它已被引用而放过它。
    const cachedRel = existing[slug];
    const cachedFile = cachedRel
      ? path.join(OUT_DIR, path.basename(cachedRel))
      : null;
    const hasCached = cachedFile ? await exists(cachedFile) : false;
    if (hasCached) logos[slug] = cachedRel;

    // 增量模式：已有图标且文件还在，直接复用，不重新下载
    if (!force && hasCached) {
      const src = existingMap.sources?.[slug];
      if (src) carriedSources[slug] = src;
      report.ok.push({ slug, url: src ?? '(cached)', cached: true });
      return;
    }

    const attempts = [];
    const candidates = [];
    if (project.llama) candidates.push(llamaIconUrl(project.llama));
    if (project.host) {
      candidates.push(llamaIconUrl(slug));
      if (project.llama) candidates.pop();
      candidates.push(...faviconUrls(project.host));
    }

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

    // 本轮所有候选都失败：先把旧来源登记进 carriedSources，
    // 保证 --force 全量重抓时 sources 记录不会被清空（见下方 mergedSources）。
    const carriedSrc = existingMap.sources?.[slug];
    if (carriedSrc) carriedSources[slug] = carriedSrc;

    // 本轮没抓到：如果手上有旧图标，就保留旧的（可用性优先于「必须是最新图标」）。
    if (hasCached) {
      const src = existingMap.sources?.[slug];
      if (src) carriedSources[slug] = src;
      report.kept.push({ slug, name: project.name, url: cachedRel, source: src ?? null });
      return;
    }

    report.failed.push({ slug, name: project.name, host: project.host, attempts });
  });

  // 清理孤立文件（项目改名 / 已被 prune 掉 / 换了扩展名）。
  // 只删「当前数据集里已不存在的 slug」的旧文件，且只删映射表里登记的旧路径，
  // 其余情况一律保留 —— 宁可留下少量孤儿文件，也不能让正在展示的图标消失。
  const projectSlugs = new Set(projects.map((p) => p.slug));
  const referenced = new Set(
    Object.values(logos).map((v) => path.basename(v)),
  );
  const retired = new Set(
    Object.entries(existing)
      .filter(([slug]) => !projectSlugs.has(slug))
      .map(([, rel]) => path.basename(rel)),
  );
  const removed = [];
  for (const f of await readdir(OUT_DIR)) {
    if (f.startsWith('.tmp-')) {
      await rm(path.join(OUT_DIR, f), { force: true });
      continue;
    }
    if (referenced.has(f)) continue;
    if (!retired.has(f)) continue;
    await rm(path.join(OUT_DIR, f), { force: true });
    removed.push(f);
  }
  if (removed.length) console.log(`[logo] 清理已下线项目的旧图标 ${removed.length} 个`);

  const sortedLogos = Object.fromEntries(Object.keys(logos).sort().map((k) => [k, logos[k]]));
  // sources 与 logos 一样按 slug 排序输出：
  // 并发抓取的完成顺序是不确定的，不排序会让 logo-map.json 每轮都产生
  // 「只换了行序」的噪音 diff（连带触发一次无意义的 GitHub 推送）。
  // 来源记录合并顺序：old → carried → 本轮成功。
  //
  // 为什么必须显式带上 `existingMap.sources`（这是 --force 的一个真实缺陷）：
  //   全量重抓时 `!force && hasCached` 这条快速路径不会执行，
  //   所以每个项目的旧来源都不会进入 carriedSources；
  //   一旦某个项目本轮抓取失败（网络抖动），它的 sources 记录就会凭空消失。
  //   而 sources 是「这张图是从哪儿来的」唯一的复核线索，属于溯源信息，
  //   绝不能因为一次重抓失败而被抹掉 —— 丢失后就再也补不回来了。
  const mergedSources = {
    ...(existingMap.sources ?? {}),
    ...carriedSources,
    ...Object.fromEntries(report.ok.map((r) => [r.slug, r.url])),
  };
  // 排序基准优先跟随已有映射表的键顺序：既保证稳定（不会因为并发完成顺序抖动），
  // 又不会因为「换了个排序方式」而在 logo-map.json 里制造整段无意义的行序 diff。
  const sourceOrder = [
    ...Object.keys(existingMap.sources ?? {}).filter((k) => mergedSources[k]),
    ...Object.keys(mergedSources)
      .filter((k) => !(k in (existingMap.sources ?? {})))
      .sort(),
  ];
  const sources = Object.fromEntries(sourceOrder.map((k) => [k, mergedSources[k]]));
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

  console.log(
    `[logo] 成功 ${report.ok.length} / ${projects.length}` +
      `${report.kept.length ? `，沿用已有 ${report.kept.length}` : ''}` +
      `${report.failed.length ? `，失败 ${report.failed.length}` : ''}`,
  );
  if (report.failed.length) {
    console.log('[logo] 未拿到图标的项目：');
    for (const f of report.failed) {
      console.log(`  ✗ ${f.slug}（${f.host ?? '无官网'}）`);
      f.attempts.slice(0, 3).forEach((a) => console.log(`      ${a}`));
    }
  }
  /**
   * 覆盖率守卫的分工（这里区分「阻断发布」与「仅告警」两种情况）。
   *
   * 为什么必须这样区分（2026-09-15 的一次真实发布事故）：
   *   项目 beezie 的官网由 Cloudflare 托管，对**数据中心出口 IP**（GitHub Actions
   *   的 runner 就是）返回 403 + `cf-mitigated: challenge`，但对住宅/办公网络放行。
   *   于是同一个提交：本地 188/188 全通过，CI 上却稳定失败。
   *
   *   而这一步失败会让后面 单测 / 校验 / 构建 / 发布 四个步骤全部被跳过 ——
   *   **一个第三方站点的反爬策略，把整个站点的发布链路锁死了**。
   *   从 2026-09-14T11:42 起，Deploy 与 Refresh Data 连续 100% 失败，
   *   而日志里只写「抓取项目 Logo 失败」，很难定位到是某个项目的官网在拦爬虫。
   *
   * 判定原则：
   *   - 若缺图的项目**已在 mapping.json 登记为不可自动抓取**（见 _blocked），
   *     说明这是「已确认、有记录」的客观限制，只告警、不阻断发布；
   *   - 否则视为「未知的抓取失败」，仍然阻断 —— 因为它可能是脚本自身或
   *     某次真实故障导致的，此时静默放过会让列表页出现空白图标位。
   *   - 阻断时给出可直接复制的修复指引（登记到 _blocked，或在 mapping.json 指定替代源）。
   */
  const blocked = new Set(Object.keys(mapping._blocked ?? {}));
  const hardFailures = [];
  const knownBlocked = [];
  for (const f of report.failed) {
    if (logos[f.slug]) continue; // 已沿用旧图标，不算缺失
    if (blocked.has(f.slug)) knownBlocked.push(f);
    else hardFailures.push(f);
  }

  if (knownBlocked.length) {
    console.warn(
      `[logo] ⚠ ${knownBlocked.length} 个项目已登记为「无法自动抓取」，按约定跳过：` +
        knownBlocked.map((f) => f.slug).join('、'),
    );
    for (const f of knownBlocked) {
      console.warn(`      ${f.slug}：${mapping._blocked[f.slug]?.reason ?? '未填写原因'}`);
    }
    console.warn('[logo] 这些项目在列表页不会有图标，属于已知且已记录的限制，不阻断发布。');
  }

  if (hardFailures.length) {
    console.error(
      `[logo] ✗ ${hardFailures.length} 个项目既没有旧图标也没抓到新图标：` +
        hardFailures.map((f) => f.slug).join('、'),
    );
    console.error('[logo] 提示：这会导致列表页出现空白图标位，请检查网络或补充 mapping.json。');
    console.error('[logo] 若确认是对方站点反爬（例如 Cloudflare 对数据中心 IP 返回 403），');
    console.error('       请在 scripts/logo/mapping.json 的 _blocked 中登记该 slug 及原因，');
    console.error('       登记后即按「已知限制」处理，不再阻断发布 —— 但请如实记录，不要用它掩盖真实故障。');
    process.exitCode = 1;
  }

  // 把本轮缺图情况写入报告，便于事后复核「哪些项目长期无图标」。
  report.blocked = knownBlocked.map((f) => ({ slug: f.slug, host: f.host, attempts: f.attempts }));
}

main().catch((e) => {
  console.error('[logo] 失败：', e);
  process.exitCode = 1;
});

/**
 * 说明（供后续维护者）：
 *
 * 本脚本与「一键更新」是两段独立链路，两者都可能让图标消失，
 * 因此各自都做了防护，改动时请勿只改一半：
 *   1) 抓取侧（本文件）—— 本轮抓取失败时保留已有文件与映射；
 *   2) 前端侧（src/lib/refresh.ts）—— 更新数据时必须同时重拉 logo-map.json；
 *   3) 构建侧（scripts/lib/ensure-logos.mjs）—— 构建前补齐缺失图标，缺图直接中断。
 * 对应的回归测试分别在 tests/logos.test.ts 与 tests/refresh.test.ts。
 */
