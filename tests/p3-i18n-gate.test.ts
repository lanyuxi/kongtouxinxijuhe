/**
 * 中文覆盖门禁「不阻断发布」的回归测试（issue #28 线上故障）。
 *
 * 为什么必须有这组测试（2026-09-18 真实事故）：
 *   `validate` 曾把「文案缺中文」一律当作**发布阻断错误**。
 *   而中文译文只存在于离线准备的 scripts/i18n/cache.zh.json，
 *   构建期纯查表、不联网翻译 —— 所以 Airdrops.io 每轮带来的**新项目**
 *   天然没有译文，门禁必然报错。
 *
 *   后果不是「某个项目文案没中文」，而是：
 *     · `npm run pipeline` 以 exit 1 结束；
 *     · GitHub Actions 的「构建静态站点」13 秒失败，
 *       「发布到 GitHub Pages」被 skip —— 也就是用户收到的失败邮件；
 *     · validate 不过就保留上一版数据，于是**全站 259 个项目停止更新**。
 *   实测失败率约 1/3（71 轮里 23 轮 error）。
 *
 * 本测试同时钉死两个方向，防止「修过头」：
 *   1. 缓存未命中（新抓到的英文）→ 只告警，**不得**阻断发布；
 *   2. 缓存命中却没应用（翻译管线回归）→ 仍必须**报错阻断**，
 *      因为历史事故里正是「有译文却退回英文」导致整站 736 条教程静默变英文。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProjects } from '../scripts/lib/validate';
import type { AirdropProject } from '../src/lib/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8'),
) as Record<string, string>;

/** 取一条真实缓存键：英文原文 + 含中文的译文。 */
const cachedEnglish = Object.keys(CACHE).find(
  (k) => CACHE[k] && /[\u4e00-\u9fa5]/.test(CACHE[k]) && !/[\u4e00-\u9fa5]/.test(k),
)!;

/** 造一个只关心文案的合法项目（其余字段从真实分片复制，避免触发无关门禁）。 */
function project(slug: string, tagline: string, title: string): AirdropProject {
  const base = JSON.parse(
    readFileSync(path.join(ROOT, 'data/details/aave-v3.json'), 'utf8'),
  ) as AirdropProject;
  return {
    ...base,
    slug,
    name: slug,
    tagline,
    guide: base.guide.map((g, i) => ({
      ...g,
      step: i + 1,
      title,
      description: '测试用描述',
      original_title: undefined,
      original_description: undefined,
    })),
  };
}

const chineseRelated = (list: string[]) => list.filter((s) => /缺少中文/.test(s));

describe('中文覆盖门禁：新文案不得阻断发布', () => {
  it('缓存未命中的英文文案 → 只告警，发布仍通过', () => {
    const r = validateProjects([
      project('brand-new-project', 'The Brand New team has not confirmed a token', 'Visit Brand New'),
    ]);
    expect(chineseRelated(r.errors)).toHaveLength(0);
    expect(chineseRelated(r.warnings).length).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });

  it('缓存命中却仍是英文 → 判定为翻译管线回归，必须阻断', () => {
    const r = validateProjects([project('regressed-project', cachedEnglish, cachedEnglish)]);
    expect(chineseRelated(r.errors).length).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it('已中文化的文案不产生任何中文相关告警', () => {
    const r = validateProjects([project('good-project', '这是一个已中文化的简介。', '连接钱包')]);
    expect(chineseRelated(r.errors)).toHaveLength(0);
    expect(chineseRelated(r.warnings)).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it('线上真实数据集（全量分片）必须仍然整体通过门禁', () => {
    const dir = path.join(ROOT, 'data/details');
    const projects = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as AirdropProject);
    expect(projects.length).toBeGreaterThan(0);
    const r = validateProjects(projects);
    expect(chineseRelated(r.errors)).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});
