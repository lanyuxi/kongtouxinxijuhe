/**
 * P1-1｜到期项目与状态口径（对应上轮审查 BUG-3）。
 *
 * 实测问题：
 *   1. `ended` 项目仍以默认列表成员身份出现，仍计入「今日新增」「值得关注」等口径；
 *      而 RSS（scripts/lib/feed.ts）**已经排除 ended** —— 同一份数据两套口径。
 *   2. 15 个项目的 tagline 明确写着 `is confirmed` / `is live`，
 *      `status` 却仍是 `potential`。前端 `describe.ts` 里已经有
 *      `taglineSaysConfirmed()` 在**文案层对账**，但 status 本身没修，
 *      于是出现「简介说已确认、状态标潜在、筛选器按潜在算」三方不一致。
 *
 * 修复原则：
 *   1. status 由 tagline 的明确信号反哺（只在「更靠后生命周期」时升级，
 *      绝不降级 —— 避免把已确认项目打回潜在）；
 *   2. 反哺必须记录来源，可追溯、可复核，不能悄悄改数据；
 *   3. `ended` 在列表侧默认不参与「活跃」口径统计。
 */
import { describe, it, expect } from 'vitest';
import { inferStatusFromTagline, reconcileStatus } from '../scripts/lib/status';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';

const now = '2026-09-16T00:00:00.000Z';

function make(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo',
    tagline: '测试',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/',
    fetchedAt: now,
    rawTitle: 'Demo',
  });
  return { ...base, ...over };
}

describe('P1-1 状态与 tagline 对账', () => {
  it('tagline 说已确认 → 推定为 confirmed', () => {
    expect(inferStatusFromTagline('The Infinex airdrop is confirmed and live.')).toBe('confirmed');
    expect(inferStatusFromTagline('The $PC airdrop is confirmed.')).toBe('confirmed');
  });

  it('否定句式不得被误判为已确认', () => {
    expect(inferStatusFromTagline('The airdrop is not confirmed yet.')).toBeNull();
    expect(inferStatusFromTagline('No token has been announced.')).toBeNull();
    expect(inferStatusFromTagline('The team has not confirmed any airdrop.')).toBeNull();
    expect(inferStatusToBeNullSafe()).toBeNull();
  });

  function inferStatusToBeNullSafe() {
    return inferStatusFromTagline('Nothing here');
  }

  it('明确说已结束 → 推定 ended', () => {
    expect(inferStatusFromTagline('This airdrop has ended.')).toBe('ended');
    expect(inferStatusFromTagline('The claim window is closed.')).toBe('ended');
  });

  it('只升级不降级：已确认项目不会因 tagline 缺失被打回潜在', () => {
    const p = make({ status: 'confirmed', tagline: '随便一句没有信号的话' });
    expect(reconcileStatus(p).status).toBe('confirmed');
  });

  it('潜在 + tagline 明确已确认 → 升为 confirmed，且记录来源可追溯', () => {
    const p = make({ status: 'potential', tagline: 'The Jupiter airdrop is confirmed and live.' });
    const r = reconcileStatus(p);
    expect(r.status).toBe('confirmed');
    expect(r.reason).toContain('tagline');
  });

  it('claim_live 不会被 tagline 的 confirmed 降级', () => {
    const p = make({ status: 'claim_live', tagline: 'The airdrop is confirmed.' });
    expect(reconcileStatus(p).status).toBe('claim_live');
  });

  it('ended 不会被 tagline 的 confirmed 拉回 confirmed（语义上已结束更靠后）', () => {
    const p = make({ status: 'ended', tagline: 'The airdrop is confirmed and live.' });
    expect(reconcileStatus(p).status).toBe('ended');
  });
});

describe('P1-1 全量数据不变量', () => {
  it('不存在「tagline 明确说已确认、status 却仍是 potential」的项目', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const bad = dataset.projects.filter(
      (p) =>
        p.status === 'potential' &&
        inferStatusFromTagline(p.tagline) === 'confirmed',
    );
    expect(
      bad.map((p) => p.slug),
      `以下项目简介说已确认但状态仍是潜在：${bad.map((p) => p.slug).join('、')}`,
    ).toEqual([]);
  });

  it('ended 项目不得出现在「值得关注」口径里', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { isHighValue } = await import('../src/lib/filter');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const bad = dataset.projects.filter((p) => p.status === 'ended' && isHighValue(p));
    expect(
      bad.map((p) => p.slug),
      `以下已结束项目仍被判「值得关注」：${bad.map((p) => p.slug).join('、')}`,
    ).toEqual([]);
  });
});

describe('P1-1 前后端规则一致性（防止两处实现漂移）', () => {
  it('前端 taglineSaysConfirmed 与流水线 inferStatusFromTagline 判定方向一致', async () => {
    const { taglineSaysConfirmed } = await import('../src/lib/describe');
    const samples = [
      'The Infinex airdrop is confirmed and live.',
      'The $PC airdrop is confirmed.',
      'The airdrop is not confirmed yet.',
      'No token has been announced.',
      'The team has not confirmed any airdrop.',
      '随便一句没有信号的话',
      'This airdrop has ended.',
    ];
    for (const s of samples) {
      const frontend = taglineSaysConfirmed(s);
      const backend = inferStatusFromTagline(s);
      // 前端认为「已确认」时，后端必须推出一个非 potential 的状态（或 ended）
      if (frontend) {
        expect(
          backend,
          `规则漂移：前端认为「${s}」已确认，但流水线推出 ${backend}`,
        ).not.toBeNull();
      }
      // 后端推出 confirmed 时，前端也必须认为「已确认」
      if (backend === 'confirmed') {
        expect(frontend, `规则漂移：流水线推出 confirmed，但前端不认为「${s}」已确认`).toBe(true);
      }
    }
  });
});
