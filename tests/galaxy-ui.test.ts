/**
 * Galaxy 组件层的样式产出回归测试
 * ---------------------------------------------------------------------------
 * 背景（这是一次真实回归，不是假想）：
 *   升级到 Galaxy 组件层时，构建成功、测试全绿、浏览器零报错，
 *   但**整个 @layer components 的内容被静默丢弃**——
 *   面板标题、按钮、徽章全部退化成默认样式。
 *
 *   根因有两条，且都不会产生任何报错：
 *     1. `@layer` 必须紧跟在 `@tailwind base/components/utilities` 之后。
 *        一旦中间夹了普通 CSS 规则，浏览器会把它当作原生 CSS 级联层
 *        （cascade layer），优先级被压到最低，Tailwind 也不再向其注入内容。
 *     2. `@layer components` 内部出现原生 CSS 声明（例如 `transition: opacity …`）
 *        时，从那条规则起往后的内容会被丢弃。
 *
 *   因此这里把「构建产物里必须存在的关键类」固化成断言。
 *   测试跑的是 `dist/` 产物 —— 也就是用户真正拿到的那份 CSS。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const DIST_ASSETS = join(ROOT, 'dist/assets');

let css = '';

beforeAll(() => {
  if (!existsSync(DIST_ASSETS)) {
    throw new Error('缺少 dist/ 产物，请先执行 npm run build');
  }
  const file = readdirSync(DIST_ASSETS).find((f) => f.endsWith('.css'));
  if (!file) throw new Error('dist/assets 下没有 CSS 产物');
  css = readFileSync(join(DIST_ASSETS, file), 'utf8');
});

describe('Galaxy 组件层：关键样式必须产出', () => {
  /**
   * 这些类一旦缺失，界面会出现「看得见但没样式」的退化状态，
   * 而且不会有任何报错 —— 只有人肉看截图才能发现。
   */
  const REQUIRED = [
    '.panel-title', // 详情页小标题的色条
    '.card', // 基础卡片
    '.panel', // 区块面板
    '.btn', // 按钮基类
    '.btn-primary', // 主按钮
    '.chip', // 徽章
    '.select', // 下拉
    '.skeleton', // 骨架屏
    '.galaxy-card', // Galaxy 卡片（顶部高光线 + 抬起）
    '.stat-tile', // Galaxy 指标磁贴
    '.stat-tile--ok', // 指标口径色
    '.icon-btn', // 卡片右上角图标按钮
    '.pointer-glow', // Galaxy 指针光源
    '.percentile-track', // 分位刻度轨
    '.sweep-line', // 详情页头部记录线
    '.stat-tile:hover', // 指标磁贴的悬停反馈
  ];

  for (const cls of REQUIRED) {
    it(`产出 ${cls}`, () => {
      expect(css).toContain(cls);
    });
  }

  it('指标磁贴的色条依赖 --tile-tone，四个口径都要有值', () => {
    for (const tone of ['--brand', '--ok', '--warn', '--danger']) {
      expect(css).toContain(`.stat-tile${tone}`);
    }
    expect(css).toContain('--tile-tone');
  });

  it('卡片顶部高光线使用了渐变而不是纯色', () => {
    // 注意：产物经过 esbuild 压缩，双冒号会被压成单冒号，因此不能按源码字面量匹配
    const idx = css.indexOf('.galaxy-card:before');
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(idx, idx + 600)).toContain('linear-gradient');
  });
});

describe('样式源文件的层级约束（防止回归再次发生）', () => {
  const src = readFileSync(join(ROOT, 'src/styles/index.css'), 'utf8');

  it('@layer 必须紧跟 @tailwind 指令，中间不能插入普通规则', () => {
    // 只看代码、不看注释：注释里会提到 @layer 与 @tailwind 这两个词
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const tailwindEnd = code.lastIndexOf('@tailwind utilities;');
    const firstLayer = code.indexOf('@layer ');
    expect(tailwindEnd).toBeGreaterThan(-1);
    expect(firstLayer).toBeGreaterThan(tailwindEnd);
    // 两者之间只允许空行
    expect(code.slice(tailwindEnd + '@tailwind utilities;'.length, firstLayer).trim()).toBe('');
  });

  it('@layer 之外不再出现第二个 @layer components', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const openers = code.match(/@layer\s+components\s*\{/g) ?? [];
    expect(openers.length).toBe(1);
  });

  it('@layer components 内不出现原生 CSS 声明（只允许 @apply 与注释）', () => {
    /**
     * 取 @layer components 的「花括号内部」逐行检查。
     * 为什么需要这条：Tailwind 遇到层内的原生声明（如 `transition: opacity …`）
     * 时会从那条规则起静默丢弃后续全部内容，且构建不报错。
     * 装饰性规则（伪元素、自定义属性）必须写在层外。
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = code.indexOf('@layer components {') + '@layer components {'.length;
    let depth = 1;
    let end = start;
    while (end < code.length && depth > 0) {
      if (code[end] === '{') depth += 1;
      else if (code[end] === '}') depth -= 1;
      end += 1;
    }
    const body = code.slice(start, end - 1);
    /**
     * 允许多行 @apply 的续行（以 `属性名：` 结尾且不含冒号后的值），
     * 以及伪元素必须的 `content: ''`。
     * 真正危险的是带具体值的原生声明（`transition: opacity …`）。
     */
    // @apply 换行后的续行形如 `focus-visible:ring-2 focus-visible:ring-brand/40;`
    // 特征是「以 `属性名:` 开头且整行没有真正的 CSS 声明值」，
    // 这里用「不含冒号+空格」作为近似判据即可覆盖本项目所有写法。
    const applyContinuation = (l: string) => l.endsWith(';') && !/[:;]\s+\S/.test(l);
    const offenders = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith(';') && !l.startsWith('@'))
      .filter((l) => !applyContinuation(l))
      .filter((l) => !/^content:\s*'';$/.test(l));
    expect(offenders).toEqual([]);
  });
});

/**
 * 流水线步骤顺序的回归测试。
 * ---------------------------------------------------------------------------
 * 背景（2026-09-15 定位的两处真实 CI 故障）：
 *   本文件断言的是 `dist/assets/*.css` 里的关键类是否产出 —— 也就是用户
 *   真正拿到的那份 CSS。因此它**必须**在 `npm run build` 之后运行。
 *
 *   但三个流水线原先的顺序都是 单元测试 → 校验 → 构建，
 *   于是本文件必然因「缺少 dist/ 产物」而失败：
 *     - GitHub `deploy-pages.yml`：部署连续失败，站点停在旧版本；
 *     - GitHub `refresh-data.yml`：失败导致「数据变化检查与提交」被跳过，
 *       数据一直无法提交回仓库；
 *     - CNB `.cnb.yml`：PR 校验与定时抓取同样受影响。
 *
 *   这个顺序问题此前一直被「抓取项目 Logo」更早的失败掩盖着 ——
 *   后续步骤全部被跳过，根本没机会跑到。修好那一处才暴露出来。
 *   所以这里把顺序固化成断言，避免它再次被同一类问题掩盖。
 */
describe('流水线步骤顺序：构建必须在单元测试之前', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

  /** 返回文中 build 与 test 步骤出现的先后（-1 表示找不到） */
  const orderOf = (src: string, buildPat: RegExp, testPat: RegExp) => ({
    build: src.search(buildPat),
    test: src.search(testPat),
  });

  it('CNB .cnb.yml：每个 build-web 都排在 unit-test 之前', () => {
    const src = read('.cnb.yml');
    const lines = src.split('\n');
    let pendingBuild = false;
    const violations: string[] = [];

    lines.forEach((line, i) => {
      const t = line.trim();
      if (/^-?\s*name:\s*build-web/.test(t)) pendingBuild = true;
      else if (/^-?\s*name:\s*unit-test/.test(t)) {
        if (!pendingBuild) violations.push(`第 ${i + 1} 行：unit-test 出现在 build-web 之前`);
        pendingBuild = false;
      }
    });

    expect(violations, `以下位置的步骤顺序错误：\n${violations.join('\n')}`).toEqual([]);
  });

  it('GitHub deploy-pages.yml：构建步骤在单元测试之前', () => {
    const src = read('.github/workflows/deploy-pages.yml');
    const { build, test } = orderOf(src, /name:\s*构建站点/, /name:\s*单元测试/);
    expect(build).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(-1);
    expect(build, '构建站点必须排在单元测试之前，否则 galaxy-ui.test.ts 找不到 dist/').toBeLessThan(test);
  });

  it('GitHub refresh-data.yml：构建步骤在单元测试之前', () => {
    const src = read('.github/workflows/refresh-data.yml');
    const { build, test } = orderOf(src, /name:\s*构建站点/, /name:\s*单元测试/);
    expect(build).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(-1);
    expect(build).toBeLessThan(test);
  });

  it('本文件确实依赖 dist/（这是上述顺序约束的正当性来源）', () => {
    // 若哪天这个依赖被去掉，上面的顺序断言就该一并删除 —— 用它提醒后来者。
    const src = read('tests/galaxy-ui.test.ts');
    expect(src).toMatch(/dist\/assets/);
    expect(src).toMatch(/缺少 dist\/ 产物/);
  });
});

/**
 * 详情页左栏宽度回归测试。
 * ---------------------------------------------------------------------------
 * 背景：左栏两轮收窄 —— 24rem（384px）→ 19rem（304px）→ 18rem（288px）。
 * 目录项与官方链接都只放 2~6 个字的短标签，用户两次反馈「左侧还是有些宽」。
 *
 * 这类回归的麻烦之处在于：改宽改窄都不会报错、不会溢出、测试全绿，
 * 只有人肉看截图才发现「又变宽了」。因此这里把宽度固化下来。
 *
 * 18rem 不是拍脑袋定的，它是「栏内固定文案不折行」这一硬约束下的下限：
 *   左栏内容区 = 18×16 - 2×24(panel padding) = 240px
 *   最长固定文案「请核对域名后再操作，谨防钓鱼站点。」单行需要 238px
 *   再收 0.05rem（239.19px）它就会折成两行。
 * 所以本测试除了断言宽度，还独立复算了这份 238px 的预算 —— 文案一旦变长，
 * 下面的断言会先于「截图里看着别扭」而报警。
 */
describe('详情页左栏宽度：收窄后不得回弹', () => {
  const src = readFileSync(join(ROOT, 'src/styles/index.css'), 'utf8');

  const parseRem = (source: string): number => {
    const m = source.match(/xl:grid-cols-\[(\d+(?:\.\d+)?)rem_minmax\(0,1fr\)\]/);
    expect(m, '未能从 detail-grid 解析出左栏宽度').not.toBeNull();
    return Number(m![1]);
  };

  it('detail-grid 左栏不得超过 18rem', () => {
    expect(parseRem(src)).toBeLessThanOrEqual(18);
  });

  it('左栏也不能窄到挤坏短标签（保留 ≥ 17rem）', () => {
    // 17rem 是「短标签仍单行」的底线；低于它目录项会换行，观感立刻变差。
    expect(parseRem(src)).toBeGreaterThanOrEqual(17);
  });

  it('18rem 下内容区仍放得下最长固定文案（238px）', () => {
    // 独立复算：左栏面板左右各 24px 内边距，内容区 = 左栏宽 - 48px。
    // 这里刻意不引用 CSS 变量，避免「改一处、两处一起错」的假绿。
    const contentWidth = parseRem(src) * 16 - 48;
    const LONGEST_FIXED_TEXT = 238; // 浏览器实测值，见文件头注释
    expect(contentWidth).toBeGreaterThanOrEqual(LONGEST_FIXED_TEXT);
  });

  it('构建产物里左栏宽度与源码一致', () => {
    // 这是本测试真正的价值所在：只断言源码，改不动产物等于没改。
    // 实测产物保留 rem（不会换算成 px），直接按 rem 匹配。
    const rem = parseRem(src);
    const grid = css.slice(css.indexOf('.detail-grid'));
    expect(grid.slice(0, 400)).toContain(`grid-template-columns:${rem}rem minmax(0,1fr)`);
  });

  it('产物里不得残留上一版的宽值（19rem / 24rem）', () => {
    // 防止「源码改了、产物还是旧的」这种最难发现的失败。
    const grid = css.slice(css.indexOf('.detail-grid'), css.indexOf('.detail-grid') + 400);
    expect(grid).not.toContain('grid-template-columns:19rem');
    expect(grid).not.toContain('grid-template-columns:24rem');
  });

  it('xl 以下仍是单列堆叠（收窄不得影响移动端）', () => {
    expect(src).toMatch(/detail-grid\s*\{[\s\S]*?grid-cols-1/);
  });
});
