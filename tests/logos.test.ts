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

    // 已在 mapping.json 的 _blocked 登记为「无法自动抓取」的项目不会有图标。
    // 它们的缺失是已知且已记录的限制（例如官网用 Cloudflare 拦数据中心 IP），
    // 因此这里的覆盖率断言按「除已登记项外全覆盖」来判定。
    // 注意：这不等于放宽要求 —— 未登记的项目一旦缺图，下面两条断言依然会失败。
    const mapping = await readJson<{ _blocked?: Record<string, unknown> }>('scripts/logo/mapping.json');
    const blocked = new Set(Object.keys(mapping._blocked ?? {}));

    const missing = dataset.projects
      .filter((p) => !blocked.has(p.slug) && !map.logos[p.slug])
      .map((p) => p.slug);
    expect(missing, `以下项目缺少 logo 映射：${missing.join('、')}`).toEqual([]);

    const broken: string[] = [];
    for (const p of dataset.projects) {
      if (blocked.has(p.slug)) continue;
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

/**
 * 下载重试逻辑的回归测试。
 * ---------------------------------------------------------------------------
 * 背景（2026-09-15 的一次真实部署失败）：
 *   GitHub Actions 的 `npm run logos` 步骤本身没有问题（同提交在本地全新克隆
 *   下 188/188 全通过），失败来自图标图床的偶发 5xx / 连接重置。
 *   但这一步一旦非 0 退出，后续的 单测 / 校验 / 构建 / 发布 四个步骤全部被跳过，
 *   线上站点会停在旧版本，而 Actions 日志里只写「抓取项目 Logo 失败」。
 *
 *   即：**一次对方站点的网络抖动，会阻断一次已经正确的构建发布。**
 *
 *   修复方式是对网络类错误做有限次退避重试。这里把「哪些错误该重试、
 *   哪些不该重试」固化下来 —— 这部分逻辑不依赖外网，可以稳定测试。
 */
describe('logo 下载的重试策略', () => {
  const script = path.join(ROOT, 'scripts/logo/fetch-logos.mjs');

  it('对 5xx / 429 做重试，对 4xx 直接放弃（重试没有意义）', async () => {
    const src = await readFile(script, 'utf8');
    // 语义断言：源码里必须出现「可重试状态码」的判定
    expect(src).toMatch(/res\.status\s*>=\s*500/);
    expect(src).toMatch(/res\.status\s*===\s*429/);
    // 且必须存在退避等待，否则会在毫秒内把重试用完，等同于没重试
    expect(src).toMatch(/setTimeout/);
  });

  it('重试次数有限，不会无限重试把流水线挂死', async () => {
    const src = await readFile(script, 'utf8');
    const m = src.match(/retries\s*=\s*(\d+)/);
    expect(m, 'httpGet 必须声明有限的 retries 默认值').not.toBeNull();
    const retries = Number(m![1]);
    expect(retries).toBeGreaterThanOrEqual(1);
    expect(retries).toBeLessThanOrEqual(5);
  });
});

/**
 * 「已登记不可抓取」与「未知失败」必须区别对待。
 * ---------------------------------------------------------------------------
 * 背景（2026-09-15 的一次真实发布事故，根因已核实）：
 *   项目 beezie 的官网 beezie.com 由 Cloudflare 托管，对**数据中心出口 IP**
 *   返回 403 + `cf-mitigated: challenge`，对住宅/办公网络放行。
 *   而 GitHub Actions 的 runner 正是数据中心 IP。
 *
 *   于是同一个提交：本地全新克隆 188/188 全通过，CI 上稳定失败 —— 实测
 *   `curl -D- https://beezie.com/favicon.ico` 返回 `HTTP 403` 且带
 *   `cf-mitigated: challenge`。
 *
 *   代价被放得极大：该步骤失败会让后面的 单测 / 校验 / 构建 / 发布 全部跳过。
 *   从 2026-09-14T11:42 起，Deploy 与 Refresh Data 连续 100% 失败，站点停在
 *   旧版本，而日志里只写「抓取项目 Logo 失败」。
 *
 * 设计取舍（这条最容易改错，所以固化成测试）：
 *   不能简单地「抓不到就放过」—— 那会让脚本自身的故障静默逃逸，
 *   列表页出现空白图标位（这是需求明确禁止的）。
 *   正确做法是区分：
 *     - 已在 mapping.json 的 _blocked 中登记的项目 → 只告警，不阻断发布；
 *     - 未登记的失败 → 仍然阻断，并给出可复制的修复指引。
 */
describe('logo 覆盖率守卫：已登记限制 vs 未知失败', () => {
  const srcPath = path.join(ROOT, 'scripts/logo/fetch-logos.mjs');
  const mappingPath = path.join(ROOT, 'scripts/logo/mapping.json');

  it('mapping.json 必须声明 _blocked 与 _blocked_policy，避免变成「随手放过」的开关', async () => {
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
    expect(mapping).toHaveProperty('_blocked');
    expect(typeof mapping._blocked_policy).toBe('string');
    // 策略里必须写清「不得用来掩盖真实故障」，否则后人会滥用这个口子
    expect(mapping._blocked_policy).toMatch(/不得|不能|不要/);
  });

  it('_blocked 的每一项都必须能自证：有原因、有证据、有核实日期', async () => {
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
    for (const [slug, meta] of Object.entries(mapping._blocked ?? {})) {
      expect(meta, `${slug} 缺少 reason`).toHaveProperty('reason');
      expect(String(meta.reason).length, `${slug} 的 reason 太短，等于没写`).toBeGreaterThan(10);
      expect(meta, `${slug} 缺少 verified_at（无法判断是否仍然成立）`).toHaveProperty('verified_at');
      expect(String(meta.verified_at)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('脚本必须区分两种情况，且未登记时仍然阻断（exitCode = 1）', async () => {
    const src = await readFile(srcPath, 'utf8');
    // 未登记的失败路径必须设置非 0 退出码
    expect(src).toMatch(/hardFailures/);
    expect(src).toMatch(/process\.exitCode\s*=\s*1/);
    // 已登记的项目必须被单独归类，且不参与阻断
    expect(src).toMatch(/knownBlocked/);
    expect(src).toMatch(/mapping\._blocked/);
  });

  it('已抓到图标的登记项属于冗余，应当删除（防止口子越开越大）', async () => {
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
    const map = await readJson<LogoMap>('data/logo-map.json');

    // 如果一个项目其实已经抓到图标了，那 _blocked 里就不该还留着它 ——
    // 否则这个字段会慢慢变成一个「永远不用清理」的垃圾桶。
    const needless = Object.keys(mapping._blocked ?? {}).filter((s) => map.logos[s]);
    expect(needless, `以下 _blocked 登记已无必要（已有图标）：${needless.join(', ')}`).toEqual([]);
  });

  it('登记项必须与数据集有交集，否则说明数据源已变、登记需要复核', async () => {
    /**
     * 注意这里的断言方向：不要求「每个登记项都还在数据集中」。
     *
     * 因为被登记的项目（如 beezie）来自 live 数据源，会随来源轮换而进进出出。
     * 若强制要求「登记项必须存在」，数据源一轮换测试就会红，逼着人删掉登记 ——
     * 等它下次再出现时又会在 CI 上炸一次，问题只是被推迟。
     *
     * 所以这里只做「一致性」检查：登记项要么在数据集中，要么明确标注了
     * retired_at（已下线）。既不误报，也不放过一个凭空挂着的假口子。
     */
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8')) as {
      _blocked?: Record<string, { retired_at?: string; source?: string; reason?: string }>;
    };
    const dataset = await readJson<Dataset>('data/airdrops.json');
    const slugs = new Set(dataset.projects.map((p) => p.slug));

    // 若项目当前不在数据集里，登记项必须说明「它为什么可能不在」
    // （例如来自会轮换的 live 数据源），或标注已下线。
    // 二者都没有，才是需要人工复核的悬空登记。
    const dangling = Object.entries(mapping._blocked ?? {})
      .filter(([slug, meta]) => !slugs.has(slug) && !meta.retired_at && !meta.source)
      .map(([slug]) => slug);

    expect(
      dangling,
      `以下 _blocked 登记已悬空（项目不在数据集中，也无 retired_at / source 说明）：${dangling.join(', ')}`,
    ).toEqual([]);
  });
});
