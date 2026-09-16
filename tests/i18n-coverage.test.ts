/**
 * 中文覆盖与中英对照的回归测试（issue #28）。
 *
 * 为什么必须有这组测试：
 *   教程文案的英文残留是**静默故障** —— 页面照常渲染、校验照常通过、
 *   日志里什么都没有，只有人工截图才能发现。实测有 49 个项目 / 339 步教程
 *   长期整段显示英文。因此这里把「必须中文」固化成断言：
 *   一旦有人新增模板文案、换数据源、或调整截断逻辑导致英文漏出，直接测试失败。
 *
 * 测试分两层：
 *   1. 纯函数层 —— 本地化、术语保护、截断行为可独立验证；
 *   2. 数据层 —— 对 data/details/ 全量断言「用户可见文案 0 处纯英文」，
 *      这是最贴近「用户实际看到什么」的那一层。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findLeftoverPlaceholders,
  loadCache,
  localizeText,
  localizeTitle,
  hasChinese,
  restoreTerms,
} from '../scripts/i18n/translate.mjs';
import {
  HUMAN_FIX,
  TERM_MAP,
  TOKEN_TERMS,
  normalizeSpacing,
  polishTitle,
  unifyPerson,
} from '../scripts/i18n/glossary.mjs';
import { auditHumanFix } from '../scripts/i18n/check-human-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8'));
loadCache(CACHE);

/** 端到端本地化：英文原文 → 最终中文（供人工修正表的护栏使用） */
const localize = (text: string) => localizeText(text).zh;

describe('中文判定', () => {
  it('含汉字的文案视为已中文化', () => {
    expect(hasChinese('连接 MetaMask 钱包')).toBe(true);
    expect(hasChinese('Check Your Eligibility')).toBe(false);
    expect(hasChinese('')).toBe(false);
    expect(hasChinese(undefined)).toBe(false);
  });
});

describe('术语保护', () => {
  it('专有名词不会被译坏（Mint USDe 不是「铸币美元」）', () => {
    expect(localizeText('Mint USDe').zh).toBe('铸造 USDe');
    expect(localizeText('Mint USDe').zh).not.toContain('铸币美元');
  });

  it('Gas 相关的句子不会出现「燃气的 SUI」这类错译', () => {
    const zh = localizeText('Confirm You Have SUI for Gas').zh;
    expect(zh).toContain('SUI');
    expect(zh).not.toContain('燃气的');
  });

  it('货币符号与英文词之间不留多余空格', () => {
    expect(normalizeSpacing('持有 $ CTM')).toBe('持有 $CTM');
    expect(normalizeSpacing('关注 @ AmmoraHQ')).toBe('关注 @AmmoraHQ');
  });

  it('中文之间不会出现空格，中英之间保留一个空格', () => {
    expect(normalizeSpacing('连接 MetaMask 钱包')).toBe('连接 MetaMask 钱包');
    expect(normalizeSpacing('连接钱包账户')).toBe('连接钱包账户');
  });

  it('术语表覆盖 Airdrops.io 教程里的典型错译', () => {
    const pairs: [string, string][] = [
      ['进入选项卡', '进入标签页'],
      ['铸币 100 个', '铸造 100 个'],
      ['每天入住', '每天签到'],
    ];
    for (const [input, expected] of pairs) {
      let out = input;
      for (const [re, to] of TERM_MAP) out = out.replace(re, to);
      expect(out).toBe(expected);
    }
  });
});

describe('人称与标题规整', () => {
  it('全站统一用「你」，不混用「您」', () => {
    expect(unifyPerson('请您连接钱包')).toBe('请你连接钱包');
  });

  it('标题去掉机器翻译残留的句末标点', () => {
    expect(polishTitle('推荐给你的朋友：')).toBe('推荐给你的朋友');
    expect(polishTitle('“查看资格”')).toBe('查看资格');
  });

  /**
   * ⚠️ 这条断言是独立审查 P1-1 的直接产物。
   *
   * 原实现只断言「存在一条含汉字的键」，恒真 —— 正是它让
   * 「32 条修正全部失效」的缺陷一路活到线上。
   * 现在改为断言：**每一条**键都真实命中缓存，且有效命中数 > 0。
   * 键与缓存失配时（改术语表、重刷缓存后最容易发生），测试立刻失败。
   */
  it('人工修正表每一条都真实命中缓存（禁止退化为死代码）', () => {
    const { total, effective, missing } = auditHumanFix(CACHE, HUMAN_FIX, localize);
    expect(total).toBeGreaterThan(0);
    expect(missing).toEqual([]);
    expect(effective).toBe(total);
  });

  /**
   * ⚠️ 第二轮审查补的护栏：**端到端生效**。
   *
   * 「键命中缓存」不够 —— 实测出现过键全部命中、但修正一条都不生效：
   * `applyGlossary` 当时拿的是译文，而 HUMAN_FIX 的键是英文原文，
   * 查表永远落空。加上这条后，两类失效（查不到 / 查到了没用）都会被拦住。
   */
  it('人工修正必须端到端生效（输入英文原文，输出登记值）', () => {
    // 修正表的键是**英文原文**，值是修正后的中文。
    // 断言等价于「把英文原文喂进完整管线，出来的必须正好是登记值」——
    // 覆盖「查表落空」「缓存被就地改写成修正值」两类失效。
    const ineffective = Object.entries(HUMAN_FIX)
      .filter(([k, v]) => localize(k) !== v)
      .map(([k]) => k.slice(0, 60));
    expect(ineffective).toEqual([]);
  });

  /**
   * ⚠️ P2-4 收口时真实踩到的坑，必须由断言锁死。
   *
   * 缓存（cache.zh.json）只放**机器译文**，修正表只放**人工修正**。
   * 一旦有人把修正值反写回缓存，就会出现自指条目：
   * `CACHE[k] === HUMAN_FIX[k]` —— applyGlossary 查得到键，
   * 但换出来的还是同一句话，整张表在运行期空转，而所有断言依然全绿。
   * 第二轮独立审查被绕过一次，因此这里把它固化成硬断言。
   */
  it('缓存里不得出现「修正值」条目（禁止自指空转）', () => {
    const selfRef = Object.entries(HUMAN_FIX)
      .filter(([, v]) => Object.values(CACHE).some((zh) => zh === v))
      .map(([k]) => k.slice(0, 60));
    expect(selfRef).toEqual([]);
  });

  /**
   * ⚠️ 该断言被独立审查 P1（第二轮）修正过，原实现比较对象写错了。
   * 原实现比较 `v === k`，恒为 false —— 测不出空转。
   *
   * 但第二轮给的判定式（`CACHE[k] === v`）在 P2-4 收口后**方向反了**：
   * 现在 `k` 就是「人工修正前的机器译文」，因此 `CACHE[k] !== v` 才是正确形态，
   * 而 `CACHE[k] === v` 恰恰说明「缓存被反写成了修正值」。
   *
   * 判定的真实目标是同一个：**这条修正在运行期必须真的改变输出**。
   * 所以不再比字符串，而是直接看「输入 → 输出」有没有变化：
   * 把缓存原文喂进去，输出必须与输入不同。
   * 这样无论键取哪一形态（英文原文 / 机器译文），空转都会被抓住。
   */
  it('人工修正不得成为空转条目（输出必须与缓存里的机器译文不同）', () => {
    // 空转 = 修正没产生任何变化。判定必须比「缓存里的机器译文」与「最终输出」：
    // 二者相同，说明这条修正在运行期等于没写。
    // 注意不能写成 `localize(k) === k`（k 是英文原文），那样恒为 false，
    // 等于没断言 —— 第二轮审查正是被这种写法绕过的。
    const noop = Object.entries(HUMAN_FIX)
      .filter(([k, v]) => CACHE[k] !== undefined && CACHE[k] !== v && localize(k) === CACHE[k])
      .map(([k]) => k.slice(0, 60));
    expect(noop).toEqual([]);
  });

  it('修正后的译文本身也必须含中文', () => {
    const bad = Object.entries(HUMAN_FIX)
      .filter(([, v]) => !hasChinese(v))
      .map(([k]) => k.slice(0, 50));
    expect(bad).toEqual([]);
  });
});

describe('本地化输出形态', () => {
  it('英文文案：同时给出中文与英文原文', () => {
    const r = localizeText('Check Your Eligibility');
    expect(hasChinese(r.zh)).toBe(true);
    expect(r.en).toBe('Check Your Eligibility');
  });

  it('中文文案：原样返回，且不标注英文原文', () => {
    const r = localizeText('参与前安全检查');
    expect(r.zh).toBe('参与前安全检查');
    expect(r.en).toBeUndefined();
  });

  it('缓存未命中时回退英文原文，不产生空白文案', () => {
    const unknown = 'Some brand new sentence never seen before.';
    const r = localizeText(unknown);
    expect(r.zh).toBe(unknown);
    expect(r.en).toBeUndefined();
  });

  it('localizeTitle 产出无尾标点的中文标题', () => {
    const r = localizeTitle('Check Your Eligibility');
    expect(hasChinese(r.zh)).toBe(true);
    expect(r.zh).not.toMatch(/[：:。！？!?]$/);
  });
});

describe('占位符还原（翻译引擎会改写占位符）', () => {
  /**
   * 为什么单独测这个：
   *   翻译引擎**不保证**把占位符原样吐回。实测同一句它吐回过
   *   `__T0__`、`_ _T 0 _ _`、`_   _T 0 _  __` 三种形态，旧实现对后两种全部失败。
   *   占位符一旦未还原，会被当正文展示给用户。
   *   这里直接模拟引擎的各种破形态。
   */
  const tokens = ['$CARDS', '$CTM'];

  it('正常形态：⟦T0⟧ 能还原为原词', () => {
    expect(restoreTerms('持有 ⟦T0⟧ 即可', tokens)).toBe('持有 $CARDS 即可');
  });

  it('相邻占位符不会互相吃掉', () => {
    // 旧实现按序号逐个 replace，尾部类会跨空白吞掉下一个占位符开头
    expect(restoreTerms('⟦T1⟧ 和 ⟦T0⟧', tokens)).toBe('$CTM 和 $CARDS');
  });

  it('旧格式 __T0__ 仍能还原（历史缓存兼容）', () => {
    expect(restoreTerms('持有 __T0__ 即可', tokens)).toBe('持有 $CARDS 即可');
  });

  it('序号越界时保留原文，不静默丢失', () => {
    expect(restoreTerms('持有 ⟦T9⟧ 即可', tokens)).toBe('持有 ⟦T9⟧ 即可');
  });

  it('findLeftoverPlaceholders 能识别新旧两种碎片', () => {
    expect(findLeftoverPlaceholders('持有 ⟦T0⟧')).toEqual(['⟦T0⟧']);
    expect(findLeftoverPlaceholders('持有 _ _T 0 _ _')).toEqual(['_ _T 0 _ _']);
    expect(findLeftoverPlaceholders('持有 $CARDS')).toEqual([]);
  });
});

describe('缓存完整性', () => {
  it('缓存里没有占位符泄漏（术语保护方案的回归护栏）', () => {
    const leaked = Object.values(CACHE).filter((v) => /_T\d+_/.test(String(v)));
    expect(leaked).toEqual([]);
  });

  /**
   * ⚠️ 独立审查 P1-2 的产物。
   *
   * 原实现只查占位符残留，查不出「已译成中文但译错」这一类 ——
   * 实测 `$CARDS` 被译成「$ 张卡片」，符号彻底丢失，
   * 用户无法在 Raydium 上兑换合约，而所有断言都是绿的。
   */
  it('原文里的代币符号必须在译文中原样保留', () => {
    const lost: string[] = [];
    for (const [en, zh] of Object.entries(CACHE)) {
      const symbols = en.match(/\$[A-Za-z][A-Za-z0-9]{1,12}/g) ?? [];
      for (const symbol of symbols) {
        if (!String(zh).includes(symbol)) lost.push(`${symbol} :: ${en.slice(0, 50)}`);
      }
    }
    expect(lost).toEqual([]);
  });

  it('译文里不出现「货币符号 + 空格」的断裂写法', () => {
    const broken = Object.entries(CACHE)
      .filter(([, zh]) => /\$\s/.test(String(zh)))
      .map(([en]) => en.slice(0, 50));
    expect(broken).toEqual([]);
  });

  /**
   * ⚠️ 独立审查 P1-2（第二轮）的产物。
   *
   * 原断言只要 `zh.includes(symbol)` 就算通过，而 `$RSGP RSGP` 里
   * 确实含有 `$RSGP` —— 符号被重复输出却测不出来，
   * 实测漏掉 10 条（`$CNPY CNPY`、`$PST PST`、`$FLOP FLOP` 等）。
   */
  it('代币符号不得被重复输出', () => {
    const dup = Object.entries(CACHE)
      .filter(([, zh]) => /\$([A-Za-z][A-Za-z0-9]{1,12})\s+\1\b/.test(String(zh)))
      .map(([en]) => en.slice(0, 50));
    expect(dup).toEqual([]);
  });

  it('代币符号不得被中文量词粘连', () => {
    // `$CARDS牌`、`$CARDS通过` 这类写法会让用户读成「$CARDS 牌」
    const stuck = Object.entries(CACHE)
      .filter(([, zh]) => /\$[A-Za-z][A-Za-z0-9]{1,12}[\u4e00-\u9fa5]/.test(String(zh)))
      .map(([en]) => en.slice(0, 50));
    expect(stuck).toEqual([]);
  });

  it('译文里不出现专有名词被音译 / 意译的已知错译', () => {
    const mistranslations = [
      '多普勒',
      '坎布里亚',
      '价值链',
      '背包',
      '币安',
      '航站楼',
      '燃气的',
      '带您进入',
      '铸币美元',
    ];
    /**
     * 为什么先做 sanitize（真实踩过的误报）：
     *   常用词「加密货币安全」的中间两字恰好是「币安」，
     *   于是 `includes('币安')` 会把它误判为交易所名被音译，
     *   导致这条断言永远红而真正的错译反而被淹没。
     *   先把这个词换成不含子串的说法，再做子串检测。
     */
    const sanitize = (text: string) =>
      String(text).split('加密货币安全').join('加密资产合规');
    const hits: string[] = [];
    for (const [en, zh] of Object.entries(CACHE)) {
      const value = sanitize(String(zh));
      for (const bad of mistranslations) {
        if (value.includes(bad)) hits.push(`${bad} :: ${en.slice(0, 40)}`);
      }
    }
    // 术语表里的「铸币 → 铸造」等纠错必须真正生效
    expect(hits).toEqual([]);
  });

  it('缓存里没有空译文', () => {
    const empty = Object.entries(CACHE).filter(([, v]) => !String(v ?? '').trim());
    expect(empty).toEqual([]);
  });

  it('缓存里的译文都有中文（避免「翻译了但没翻」）', () => {
    const noChinese = Object.entries(CACHE)
      .filter(([, v]) => !hasChinese(v))
      .map(([k]) => k.slice(0, 60));
    expect(noChinese).toEqual([]);
  });

  it('专有名词表非空且按长度倒序（避免子串互相破坏）', () => {
    expect(TOKEN_TERMS.length).toBeGreaterThan(50);
    const sorted = [...TOKEN_TERMS].sort((a, b) => b.length - a.length);
    expect(TOKEN_TERMS).toEqual(sorted);
  });
});

describe('全量数据：用户可见文案必须含中文', () => {
  const detailsDir = path.join(ROOT, 'data/details');
  const files = readdirSync(detailsDir).filter((f) => f.endsWith('.json'));

  it('data/details 下存在完整项目', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('没有纯英文的教程标题 / 描述 / 一句话简介', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      const isEnOnly = (v: unknown) =>
        typeof v === 'string' && v.trim() && !hasChinese(v) && /[A-Za-z]{4,}/.test(v);
      if (isEnOnly(p.tagline)) offenders.push(`${p.slug}: tagline`);
      for (const g of p.guide ?? []) {
        if (isEnOnly(g.title)) offenders.push(`${p.slug}: 步骤 ${g.step} 标题`);
        if (isEnOnly(g.description)) offenders.push(`${p.slug}: 步骤 ${g.step} 描述`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ 原实现是 `if (!g.original_title) continue` —— 只覆盖「有英文原文的步骤」，
   * 无原文的步骤（模板生成的、以及平台自写的中文步骤）标题缺中文时会被跳过。
   * 实测这正是漏检盲区：模板步骤若被误写成英文，测试仍然全绿。
   * 现在改为**遍历全部步骤**，无原文的也必须自带中文。
   */
  it('每个教程步骤都必须有中文标题与中文描述', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      for (const g of p.guide ?? []) {
        if (!hasChinese(g.title)) offenders.push(`${p.slug}: 步骤 ${g.step} 标题无中文`);
        if (!hasChinese(g.description)) offenders.push(`${p.slug}: 步骤 ${g.step} 描述无中文`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('有英文原文的步骤必须中英两版都在（可对照）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      for (const g of p.guide ?? []) {
        if (!g.original_title) continue;
        if (!hasChinese(g.title)) offenders.push(`${p.slug}: 步骤 ${g.step} 有原文但标题无中文`);
        // 原文本身必须是英文，否则说明「原文/译文」字段写反了
        if (hasChinese(g.original_title)) {
          offenders.push(`${p.slug}: 步骤 ${g.step} 的 original_title 不是英文`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('英文原文不得含中文（防止原文/译文写反）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      if (p.tagline_en && hasChinese(p.tagline_en)) offenders.push(`${p.slug}: tagline_en`);
      for (const g of p.guide ?? []) {
        if (g.original_description && hasChinese(g.original_description)) {
          offenders.push(`${p.slug}: 步骤 ${g.step} original_description`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ P1-5 新增：**已中文化但译错**的收口断言。
   *
   * 旧的「必须含中文」门禁抓不住「门户 / 羽毛 / 宝石 / 您」这类错译 ——
   * 页面上没有一处英文，校验全绿，但用户拿「门户」去项目页面里
   * 根本找不到对应入口（实测 36 条教程正文如此）。
   * 这里对**全量数据**做一次最终输出扫描：
   * 只要用户可见文案里还出现这些「术语表已明确要求保留英文」的词，直接失败。
   */
  it('全量数据里不得出现已收口的机器错译（门户 / 羽毛 / 您 …）', async () => {
    const { loadCache, localizeText } = await import('../scripts/i18n/translate.mjs');
    loadCache(CACHE);
    const BAD = [
      '门户',
      '羽毛',
      '卡牌',
      '朝圣者',
      '您',
      '索赔',
      '选项卡',
      '小部件',
      '桥接',
      '笔记本',
      '任务板',
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      const visible = [
        p.tagline,
        ...(p.guide ?? []).flatMap((g: { title?: string; description?: string }) => [
          g.title,
          g.description,
        ]),
      ];
      for (const text of visible) {
        const out = typeof text === 'string' ? localizeText(text).zh : '';
        for (const bad of BAD) {
          if (out.includes(bad)) offenders.push(`${p.slug}: ${bad} :: ${out.slice(0, 40)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('本地化不得改动事实性字段（评分 / 状态 / 来源）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      if (!p.scores || typeof p.scores.authenticity !== 'number') offenders.push(`${p.slug}: scores`);
      if (!p.status) offenders.push(`${p.slug}: status`);
      if (!Array.isArray(p.evidence)) offenders.push(`${p.slug}: evidence`);
      for (const g of p.guide ?? []) {
        // 步骤的可追溯性字段不能被本地化顺手改掉
        if (g.source_verified && !g.source_url) offenders.push(`${p.slug}: 步骤 ${g.step} 假核实`);
        if (!['low', 'medium', 'high', 'critical'].includes(g.risk)) {
          offenders.push(`${p.slug}: 步骤 ${g.step} 风险等级异常`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('一句话简介若保留英文原文，则中文版本也必须存在', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      if (p.tagline_en && !hasChinese(p.tagline)) offenders.push(`${p.slug}: tagline`);
      // 反向对照不能是中文（曾出现「英文原文」字段里存的是中文译文）
      if (p.tagline_en && hasChinese(p.tagline_en)) offenders.push(`${p.slug}: tagline_en 不是英文`);
    }
    expect(offenders).toEqual([]);
  });
});
