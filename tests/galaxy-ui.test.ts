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
