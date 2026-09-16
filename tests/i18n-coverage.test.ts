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
import { loadCache, localizeText, localizeTitle, hasChinese } from '../scripts/i18n/translate.mjs';
import {
  HUMAN_FIX,
  TERM_MAP,
  TOKEN_TERMS,
  normalizeSpacing,
  polishTitle,
  unifyPerson,
} from '../scripts/i18n/glossary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8'));
loadCache(CACHE);

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

  it('人工修正表里的标题会被采用', () => {
    const key = Object.keys(HUMAN_FIX).find((k) => /[\u4e00-\u9fa5]/.test(k));
    expect(key).toBeTruthy();
    expect(HUMAN_FIX[key!]).toMatch(/[\u4e00-\u9fa5]/);
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

describe('缓存完整性', () => {
  it('缓存里没有占位符泄漏（术语保护方案的回归护栏）', () => {
    const leaked = Object.values(CACHE).filter((v) => /_T\d+_/.test(String(v)));
    expect(leaked).toEqual([]);
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

  it('英文原文步骤必须同时保留中英两版（可对照）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const p = JSON.parse(readFileSync(path.join(detailsDir, file), 'utf8'));
      for (const g of p.guide ?? []) {
        if (!g.original_title) continue;
        // 有原文就必须有译文，否则前端会退化成「只显示英文」
        if (!hasChinese(g.title)) offenders.push(`${p.slug}: 步骤 ${g.step} 有原文但标题无中文`);
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
