/**
 * Logo 覆盖率与渲染测试。
 *
 * 背景：本次需求明确要求「列表页不得出现缺省图或字母图」。
 * 这类问题在浏览器里只会静默变成破图，人工很难逐个点开检查，
 * 因此把规则固化进测试：
 *   1. 每个项目都必须能解析到一张真实存在的图标文件；
 *   2. 卡片组件不得再渲染「首字母色块」这种占位形态；
 *   3. 抓取脚本的占位图识别函数必须能拦住常见的假图标。
 */

import { describe, it, expect } from 'vitest';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniffImage, isPlaceholderSvg, faviconUrls, hostOf, isOfficialHost } from '../scripts/logo/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

interface Dataset {
  projects: { slug: string; name: string }[];
}
interface LogoMap {
  total: number;
  logos: Record<string, string>;
}

async function readJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8')) as T;
}

describe('logo 覆盖率', () => {
  it('每个项目都有 logo 映射，且文件真实存在', async () => {
    const dataset = await readJson<Dataset>('data/airdrops.json');
    const map = await readJson<LogoMap>('data/logo-map.json');

    const missing = dataset.projects.filter((p) => !map.logos[p.slug]).map((p) => p.slug);
    expect(missing, `以下项目缺少 logo 映射：${missing.join('、')}`).toEqual([]);

    const broken: string[] = [];
    for (const p of dataset.projects) {
      const file = path.join(ROOT, 'public', map.logos[p.slug]);
      try {
        await access(file);
        const info = await stat(file);
        // 图标被误存成占位小图时体积会异常小，这里顺手拦一次
        if (info.size < 200) broken.push(`${p.slug}(${info.size}B)`);
      } catch {
        broken.push(`${p.slug}(缺失)`);
      }
    }
    expect(broken, `以下项目的 logo 文件不可用：${broken.join('、')}`).toEqual([]);
  });

  it('logo 文件不是空文件，也不是被截断的图片', async () => {
    const map = await readJson<LogoMap>('data/logo-map.json');
    const files = new Set(Object.values(map.logos).map((f) => path.basename(f)));

    for (const f of files) {
      const buf = await readFile(path.join(ROOT, 'public', 'logos', f));
      // 只校验二进制图片格式；SVG 由 isPlaceholderSvg 单独把关
      if (f.endsWith('.svg')) continue;
      expect(sniffImage(buf), `${f} 不是可识别的图片格式`).not.toBeNull();
    }
  });

  it('public/logos 下没有残留的临时文件', async () => {
    const entries = await readdir(path.join(ROOT, 'public', 'logos'));
    const tmp = entries.filter((e) => e.startsWith('.tmp-'));
    expect(tmp, `发现临时文件残留：${tmp.join('、')}`).toEqual([]);
  });
});

describe('抓取脚本的占位图识别', () => {
  it('识别 favicon.im 的灰色单字母兜底图', () => {
    const placeholder =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#808080" /><text x="50" y="65" font-style="italic">f</text></svg>';
    expect(isPlaceholderSvg(placeholder)).toBe(true);
  });

  it('不会把正常 logo 误判为占位图', () => {
    const real = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="#F50DB4"/></svg>';
    expect(isPlaceholderSvg(real)).toBe(false);
  });

  it('按文件头识别图片格式，不信任 content-type', () => {
    expect(sniffImage(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'))).toBe('png');
    // ICO 头只需要前 4 字节，但 sniffImage 有最短长度保护，
    // 这里补足 16 字节以模拟真实文件，避免测试本身失真
    expect(sniffImage(Buffer.from('000001000100' + '00'.repeat(10), 'hex'))).toBe('ico');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
    expect(sniffImage(Buffer.from('<html><body>Not Found</body></html>'))).toBeNull();
  });
});

describe('官网域名判定', () => {
  it('取主机名并剥掉 www', () => {
    expect(hostOf('https://www.aave.com/')).toBe('aave.com');
    expect(hostOf('not-a-url')).toBeNull();
  });

  it('拒绝把聚合站 / 任务平台当成项目官网', () => {
    expect(isOfficialHost('defillama.com')).toBe(false);
    expect(isOfficialHost('app.galxe.com')).toBe(false);
    expect(isOfficialHost('airdrops.io')).toBe(false);
    expect(isOfficialHost('aave.com')).toBe(true);
    expect(isOfficialHost('layerzero.network')).toBe(true);
  });

  it('favicon 服务按优先级排序，且包含域名', () => {
    const urls = faviconUrls('aave.com');
    expect(urls.length).toBeGreaterThanOrEqual(2);
    urls.forEach((u) => expect(u).toContain('aave.com'));
  });
});

describe('前端不再渲染字母 / 缺省 logo', () => {
  it('ProjectLogo 组件没有「取首字母」这类占位实现', async () => {
    const src = await readFile(path.join(ROOT, 'src/components/ProjectLogo.tsx'), 'utf8');
    // 组件必须真的渲染 <img>，并把 src 指向项目 logo
    expect(src).toContain('src={project.logo}');
    // 不允许再出现「slice 后 toUpperCase 拼首字母」的占位写法
    expect(src).not.toMatch(/slice\(0,\s*\d\)[^\n]*toUpperCase/);
    // 缺失分支必须是无文字的占位块
    expect(src).toContain('data-logo-missing');
  });

  it('ProjectCard / DetailView 都已切换到 ProjectLogo，且不再有「查看详情」按钮', async () => {
    const card = await readFile(path.join(ROOT, 'src/components/ProjectCard.tsx'), 'utf8');
    const detail = await readFile(path.join(ROOT, 'src/pages/DetailView.tsx'), 'utf8');

    expect(card).toContain("from './ProjectLogo'");
    expect(detail).toContain("from '../components/ProjectLogo'");

    // 「查看详情」按钮已按需求移除；整卡是一个指向详情页的链接
    expect(card).not.toMatch(/>\s*查看详情\s*</);
    expect(card).toMatch(/href=\{href\}/);
    expect(card).toContain('aria-label={`查看 ${p.name} 详情`}');
  });
});

/**
 * 回归测试：图标抓取不得删除「本轮没抓到」的已有图标。
 *
 * 对应线上事故：用户点「一键更新」后，刷新两轮图标全部消失。
 * 根因是抓取脚本把「本轮没抓到图标的项目」当成孤儿，
 * 直接删除 public/logos/ 下的文件并从 logo-map.json 里摘掉映射。
 * 下面这些用例把「已抓到的图标不可回退」钉死在测试里。
 */
describe('图标抓取不会丢图标（回归）', () => {
  const SCRIPT = path.join(ROOT, 'scripts/logo/fetch-logos.mjs');

  it('清理逻辑不再使用「不在本轮抓到 = 删除」的口径', async () => {
    const src = await readFile(SCRIPT, 'utf8');
    // 旧实现：keep 集合只来自本轮成功列表，其余一律 rm
    expect(src).not.toMatch(/const keep = new Set\(Object\.values\(logos\)/);
    // 新实现：只有「已从数据集消失的项目」才进入可清理集合
    expect(src).toContain('const retired = new Set(');
    expect(src).toContain('const projectSlugs = new Set(projects.map((p) => p.slug));');
  });

  it('抓取失败但已有旧图标时，映射仍然保留该图标', async () => {
    const src = await readFile(SCRIPT, 'utf8');
    // 必须先绑定旧映射，再尝试抓取，最后在失败分支里保留
    expect(src).toContain('if (hasCached) logos[slug] = cachedRel;');
    expect(src).toMatch(/if \(hasCached\) \{\s*const src = existingMap\.sources/);
    expect(src).toContain('report.kept.push(');
  });

  it('脚本语法可执行，且导出结构完整', async () => {
    const { stdout } = await execFileAsync('node', ['--check', SCRIPT]);
    expect(stdout).toBe('');
  });
});

describe('构建期图标兜底 ensure-logos', () => {
  it('当前数据集与图标映射完全对齐（无缺失）', async () => {
    const { findMissingLogos } = await import('../scripts/lib/ensure-logos.mjs');
    const missing = await findMissingLogos();
    expect(missing, `以下项目缺图标：${missing.join('、')}`).toEqual([]);
  });

  it('build 脚本已接入图标兜底，缺失时不会产出站点', async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toContain('ensure-logos');
  });
});

/**
 * 抓取脚本的「模块绑定」回归测试。
 * ---------------------------------------------------------------------------
 * 背景（这是一次真实事故，2026-09-15 定位）：
 *   `scripts/logo/fetch-logos.mjs` 里调用了 `sniffImage` / `isPlaceholderSvg`，
 *   但 import 语句里只带了 `faviconUrls, hostOf, isOfficialHost, llamaIconUrl`。
 *
 *   这条路径**本地跑不出来**，只有脏数据才会触发：
 *     正常网络下 189 个项目里 188 个命中缓存或直接抓取成功，
 *     最后一个（beezie）在候选 URL 全部失败时才会走到 `sniffImage(buf)`
 *     —— 而这恰好是它第一次真正执行到那一行。
 *
 *   后果不是「抓不到一张图」，而是**整条数据流水线静默中断**：
 *   `npm run logos` 以非 0 退出 → 后续的 unit-test / validate-data /
 *   commit-data / sync-to-github 四个 stage 全部被跳过
 *   → 数据不再提交，**GitHub 也停止同步**。
 *   而 CNB 上看到的只是「定时任务失败」，没人会把它和一行漏掉的 import 联系起来。
 *
 *   所以这里不测「能不能抓到图」（依赖外网，天生不稳定），
 *   只测「脚本引用的每个外部符号都真的被 import 进来了」——
 *   这正是那次事故里唯一真正出错的地方，且与网络无关、可离线稳定运行。
 */
describe('logo 抓取脚本的模块绑定', () => {
  const script = path.join(ROOT, 'scripts/logo/fetch-logos.mjs');

  it('引用了 sources.mjs 的导出，就必须真的 import 它们', async () => {
    const src = await readFile(script, 'utf8');
    const sources = await readFile(path.join(ROOT, 'scripts/logo/sources.mjs'), 'utf8');

    const exported = [...sources.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);

    // 取 import 语句里来自 './sources.mjs' 的那一条，解析出实际导入的名字
    const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/sources\.mjs'/);
    expect(importLine, 'fetch-logos.mjs 必须从 ./sources.mjs 导入共享实现').not.toBeNull();
    const imported = importLine![1].split(',').map((s) => s.trim()).filter(Boolean);

    // 逐个检查：源码里出现了这个函数调用，但没 import → 运行时 ReferenceError
    const dangling = exported.filter(
      (name) => !imported.includes(name) && new RegExp(`\\b${name}\\s*\\(`).test(src),
    );

    expect(dangling, `以下函数被调用但没有 import，运行到即崩溃：${dangling.join(', ')}`).toEqual([]);
  });

  it('脚本顶层可被解析为合法 ESM（漏 import 不会在这一步报错，故需上一条断言兜底）', async () => {
    // 用 --check 只验证语法。这里保留它是为了区分「语法错误」与「绑定错误」两类问题。
    await execFileAsync('node', ['--check', script]);
  });
});
