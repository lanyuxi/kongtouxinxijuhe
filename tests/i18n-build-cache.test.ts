/**
 * `build-cache.mjs` 的回归护栏（独立审查发现的 P0-2）。
 *
 * 背景（真实故障）：
 *   该脚本是 ESM（`.mjs` + `"type":"module"`），却用了 `require('node:fs')`，
 *   抛出的 `ReferenceError` 被一个**裸 catch** 吞掉，函数返回空数组，
 *   于是脚本永远打印「缺失 0 条」——**它是死脚本，而且报告是「无缺口」**。
 *
 *   任何人按文档「跑 build-cache 补译」都会得到「没有缺口」的结论。
 *   issue #28 的 47 处错译正是这样错过了一轮。
 *
 * 这组断言锁死两件事：
 *   1. 语料收集**真的能读到** data/details（不是空集）；
 *   2. 收集到的英文原文数量与真实缺口同量级（防止裸 catch 静默回退）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('build-cache 语料收集（P0-2：死脚本回归护栏）', () => {
  it('collectTexts 能读到 data/details 的英文原文（非空）', async () => {
    /**
     * ⚠️ 直接 import 生产函数，而不是复刻实现。
     *    复刻实现是本轮被审查抓到的 P0-1 同类问题
     *    （测试测的是自己抄的那份代码，改真实实现测不出来）。
     */
    const mod = await import('../scripts/i18n/build-cache.mjs');
    const texts = mod.collectTexts();
    expect(Array.isArray(texts)).toBe(true);
    expect(
      texts.length,
      '语料为空说明 data/details 读取失败（require 在 ESM 下会抛错，且不能被裸 catch 吞掉）',
    ).toBeGreaterThan(100);
  });

  it('收集到的文案都是「面向用户且仍是英文」的', async () => {
    const mod = await import('../scripts/i18n/build-cache.mjs');
    const texts = mod.collectTexts();
    const hasChinese = (t: string) => /[\u4e00-\u9fa5]/.test(t);
    const withChinese = texts.filter((t: string) => hasChinese(t));
    expect(withChinese, '已中文化的文案不该进补译语料').toEqual([]);
    const latin = texts.filter((t: string) => /[A-Za-z]{4,}/.test(t));
    expect(latin.length, '英文原文应占绝大多数').toBe(texts.length);
  });

  it('缓存与语料的缺口可被真实计算（不再是恒 0）', async () => {
    const mod = await import('../scripts/i18n/build-cache.mjs');
    const cache = JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8'));
    const texts: string[] = mod.collectTexts();
    const missing = texts.filter((t) => !cache[t]);
    /**
     * 这里**不断言 missing === 0**（有缺口是正常的，需要人工补译），
     * 只断言「计算链路是通的」：语料非空、且缓存命中数可统计。
     * 真正的回归点是上一条「语料非空」——
     * 旧脚本的形态是「语料恒为空 → missing 恒为 0 → 报告无缺口」。
     */
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.length - missing.length, '缓存命中数应可统计').toBeGreaterThanOrEqual(0);
  });

  it('脚本里不得再出现裸 catch 吞掉读取错误', () => {
    const src = readFileSync(path.join(ROOT, 'scripts/i18n/build-cache.mjs'), 'utf8');
    // 不得在**代码**里使用 require（ESM 下必抛）。
    // 先去掉注释行再判定 —— 注释里说明这个坑是应该的，不能把注释也算成违规。
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code, 'build-cache.mjs 是 ESM，代码里不得使用 require').not.toMatch(/\brequire\s*\(/);
    // 读取 data/details 的 catch 必须打印原因
    const from = src.indexOf('export function collectTexts');
    const to = src.indexOf('/** 从链接取主机名', from) > 0 ? src.indexOf('/** 从链接取主机名', from) : src.length;
    const readBlock = src.slice(from, to);
    expect(readBlock, 'collectTexts 的 catch 必须打印错误原因').toMatch(/console\.error/);
  });
});
