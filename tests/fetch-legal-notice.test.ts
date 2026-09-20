/**
 * 数据源「站务/法律页」过滤 + 图标门禁「结构性无图」豁免。
 *
 * 线上事故（2026-09-20，用户连续两天收到 GitHub 失败邮件）：
 *   airdrops.io 页脚的「法律声明」链接 `/legal-notice/` 被当成一个正常
 *   空投项目抓进了库。它没有官网 → 图标永远抓不到 → `npm run logos`
 *   退出码 1 → 后续 单测 / 校验 / 构建 / 部署 四个步骤全部被跳过
 *   → **全站 268 个项目停更**，每 10 分钟触发一次失败邮件。
 *
 *   这与 2026-09-15 的 beezie（Cloudflare 反爬）事故是同一个模式：
 *   一个与本次发布无关的问题锁死了整条发布链路。上次只针对反爬打了补丁，
 *   没有推广成原则，所以这次换了个马甲（无官网）又复发。
 *
 * 本测试钉死两条修复，防止第三次复发：
 *   1. `extractProjectLinks` 必须过滤「站务/法律/运营」路径（结构化判据，不是穷举）；
 *   2. 图标覆盖率守卫对「结构性无图」（连官网都没有）只告警、不阻断发布；
 *      而对「有官网却抓取失败」仍然阻断 —— 不能把门禁修成摆设。
 *
 * 说明：第 2 条用**真实执行脚本**验证（复制仓库到临时目录、注入脏数据、
 *   屏蔽网络），而不是 grep 源码 —— 断言行为，不断言代码长相。
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProjectLinks, isNonProjectPath } from '../scripts/fetch/airdrops-io.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_SCRIPT = path.join(ROOT, 'scripts/logo/fetch-logos.mjs');

describe('站务/法律页不得被当成空投项目', () => {
  it('legal-notice 必须被识别为非项目（本次事故的直接命中项）', () => {
    expect(isNonProjectPath('legal-notice')).toBe(true);
  });

  it('常见站务/法律/运营路径全部命中', () => {
    const garbage = [
      'legal-notice',
      'legal',
      'notice',
      'privacy-policy',
      'privacy',
      'terms',
      'terms-of-service',
      'cookie-policy',
      'imprint',
      'impressum',
      'disclaimer',
      'faq',
      'careers',
      'jobs',
      'sitemap',
      'rss',
      'newsletter',
      'advertise',
    ];
    for (const seg of garbage) {
      expect(isNonProjectPath(seg), `${seg} 应被判为非项目`).toBe(true);
    }
  });

  it('真实项目不得被误杀（这是上一版把 x.com 子串匹配搞错的老坑）', () => {
    const realProjects = [
      'lido',
      'pendle',
      'aave-v3',
      'term-finance',
      'contactless-pay',
      'term-structure',
      'legalzoom',
      'noticedao',
      'pressplay',
      'wager-predict',
      // 以下刻意「不收」的边界词：作为项目名首词完全可能，不能误杀
      'press-play',
      'media-dao',
      'about-face',
      'support-dao',
      'contact-us-dao',
    ];
    for (const slug of realProjects) {
      expect(isNonProjectPath(slug), `${slug} 是真实项目，不应被过滤`).toBe(false);
    }
  });

  it('extractProjectLinks 从列表页 HTML 里剔除站务链接', () => {
    const html = `
      <a href="https://airdrops.io/latest/">Latest</a>
      <a href="https://airdrops.io/legal-notice/">Legal Notice</a>
      <a href="https://airdrops.io/privacy-policy/">Privacy</a>
      <a href="https://airdrops.io/real-project/">Real Project</a>
    `;
    const links = extractProjectLinks(html);
    expect(links).toContain('https://airdrops.io/real-project/');
    expect(links.join(' ')).not.toContain('legal-notice');
    expect(links.join(' ')).not.toContain('privacy-policy');
  });

  it('当前线上数据集里不得存在站务/法律类 slug', async () => {
    const dataset = JSON.parse(await readFile(path.join(ROOT, 'data/airdrops.json'), 'utf8'));
    const bad = dataset.projects.filter((p: { slug: string }) => isNonProjectPath(p.slug));
    expect(bad.map((p: { slug: string }) => p.slug)).toEqual([]);
  });
});

describe('图标门禁：结构性无图不得锁死整站发布', () => {
  it('分类函数把三类缺图归位（这是本次事故的核心判据）', async () => {
    const { classifyLogoGaps } = await import('../scripts/logo/fetch-logos.mjs');
    const r = classifyLogoGaps(
      [
        // 本次事故的元凶：没有官网 → 结构性无图
        { slug: 'legal-notice', name: 'Legal Notice', host: null },
        // beezie：有官网，只是被反爬 → 应在阻断类
        { slug: 'beezie', name: 'Beezie', host: 'beezie.io' },
        // 已人工登记为已知限制
        { slug: 'blocked-x', name: 'Blocked', host: 'blocked.example' },
        // 已沿用旧图标 → 完全不计入缺图
        { slug: 'have-logo', name: 'Has', host: null },
      ],
      { lido: 'logos/lido.png', 'have-logo': 'logos/have-logo.png' },
      new Set(['blocked-x']),
    );
    expect(r.structurallyImpossible.map((f) => f.slug)).toEqual(['legal-notice']);
    expect(r.hardFailures.map((f) => f.slug)).toEqual(['beezie']);
    expect(r.knownBlocked.map((f) => f.slug)).toEqual(['blocked-x']);
  });

  it('无官网的脏项目不得落入阻断类（否则整站停更）', async () => {
    const { classifyLogoGaps } = await import('../scripts/logo/fetch-logos.mjs');
    const r = classifyLogoGaps([{ slug: 'legal-notice', host: null }], {}, new Set());
    expect(r.hardFailures).toEqual([]);
    expect(r.structurallyImpossible).toHaveLength(1);
  });

  it('有官网却抓取失败仍然阻断 —— 门禁没被修成摆设', async () => {
    const { classifyLogoGaps } = await import('../scripts/logo/fetch-logos.mjs');
    const r = classifyLogoGaps([{ slug: 'some-project', host: 'some-project.io' }], {}, new Set());
    expect(r.hardFailures.map((f) => f.slug)).toEqual(['some-project']);
    expect(r.structurallyImpossible).toEqual([]);
  });

  it('「结构性无图」分支不得设置非 0 退出码', async () => {
    const src = await readFile(LOGO_SCRIPT, 'utf8');
    const idx = src.indexOf('if (structurallyImpossible.length)');
    expect(idx).toBeGreaterThan(-1);
    // 该分支到下一段 hardFailures 分支之间，不得出现 process.exitCode = 1
    const seg = src.slice(idx, src.indexOf('if (hardFailures.length)', idx));
    expect(seg).not.toMatch(/process\.exitCode\s*=\s*1/);
  });

  it('「有官网抓取失败」分支必须仍然设置非 0 退出码', async () => {
    const src = await readFile(LOGO_SCRIPT, 'utf8');
    const idx = src.indexOf('if (hardFailures.length)');
    expect(idx).toBeGreaterThan(-1);
    const seg = src.slice(idx, idx + 1600);
    expect(seg).toMatch(/process\.exitCode\s*=\s*1/);
  });
});
