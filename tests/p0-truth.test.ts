import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AirdropProject, Evidence } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import { buildEvidence, verifyAll } from '../scripts/lib/verify';
import { applyProfile } from '../scripts/lib/enrich';
import { buildGuideAndCost, generateFaq } from '../scripts/lib/guide';
import { applySourced, costFromSource, stepsFromSource } from '../scripts/lib/sourced';
import { normalizeStatus } from '../scripts/lib/normalize';
import { reconcileAll } from '../scripts/lib/status';
import { scoreAuthenticity } from '../scripts/lib/score';
import { toListProject } from '../scripts/lib/list';
import { buildOfficialDomains, checkDomain } from '../src/lib/scam';
import { beginnerVerdict } from '../src/lib/beginner';
import { applyCostBucket, sortProjects } from '../src/lib/filter';

const at = '2026-09-22T12:00:00.000Z';
function project(over: Partial<AirdropProject> = {}): AirdropProject {
  return { ...toSkeleton({ slug: 'demo', name: 'Demo', tagline: '待核实活动', status: 'potential',
    chains: [], sourceType: 'airdrop_aggregator', sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/', fetchedAt: at, rawTitle: 'Demo' }), ...over };
}
function reviewed(type: Evidence['type'], url: string, activity_status?: Evidence['activity_status']): Evidence {
  return { type, url, label: '人工核验的具体来源', verified: true,
    verification: { method: 'manual_review', source_url: url, checked_at: '2026-09-23T12:00:00.000Z',
      note: '逐项核对项目归属与页面中的活动说明' }, activity_status } as Evidence;
}

describe('P0 官方证据的信任边界', () => {
  it('候选域名不能生成已核实的官网、文档、融资或公告', () => {
    const p = project({ official: { website: 'https://unrelated.example', docs: 'https://other.example/docs' },
      meta: { funding: '第三方融资线索' } });
    const ev = buildEvidence(p);
    expect(ev.filter(e => e.type !== 'third_party' && e.verified)).toEqual([]);
    expect(ev.some(e => e.type === 'official_announcement')).toBe(false);
  });
  it('遗留 verified 布尔值不能代替核验记录', () => {
    const p = project({ official: { website: 'https://demo.example' }, evidence: [
      { type: 'official_website', url: 'https://demo.example', label: '旧标签', verified: true } ] });
    expect(buildEvidence(p).find(e => e.type === 'official_website')?.verified).toBe(false);
  });
  it('明确人工核验记录经两轮生成仍保留，但不凭空产生公告', () => {
    const p = project({ official: { website: 'https://demo.example' },
      evidence: [reviewed('official_website', 'https://demo.example')] });
    const once = verifyAll([p])[0];
    const twice = verifyAll([once])[0];
    expect(twice.evidence).toEqual(once.evidence);
    expect(twice.evidence.find(e => e.type === 'official_website')?.verified).toBe(true);
    expect(twice.evidence.some(e => e.type === 'official_announcement')).toBe(false);
  });
  it('档案核验记录覆盖抓取来的同类型链接，空证据仍不自证', () => {
    const p = applyProfile(project({ official: { website: 'https://wrong.example' } }), {
      official: { website: 'https://demo.example' }, evidence: [reviewed('official_website', 'https://demo.example')] });
    expect(p.official.website).toBe('https://demo.example');
    expect(buildEvidence(p).find(e => e.type === 'official_website')?.verified).toBe(true);
  });
  it('防骗库只纳入经过核验且与当前入口一致的官网', () => {
    const candidate = toListProject(verifyAll([project({ official: { website: 'https://unrelated.example' } })])[0]);
    expect(checkDomain('https://unrelated.example', buildOfficialDomains([candidate])).verdict).toBe('unknown');
    const trusted = toListProject(verifyAll([project({ official: { website: 'https://demo.example' },
      evidence: [reviewed('official_website', 'https://demo.example')] })])[0]);
    expect(checkDomain('https://demo.example', buildOfficialDomains([trusted])).verdict).toBe('official');
  });
  it('无核验记录的链接不产生官方评分或已核实清单', () => {
    const p = project({ status: 'confirmed', official: { website: 'https://a.example', docs: 'https://b.example', github: 'https://github.com/unknown' },
      meta: { funding: '未核实融资' } });
    p.evidence = buildEvidence(p);
    const score = scoreAuthenticity(p, p.evidence);
    expect(score.items.find(x => x.key === 'authenticity.announcement')?.value).toBe(0);
    for (const label of ['官方网站', '官方文档', '开源仓库', '融资信息']) {
      expect(score.checklist?.find(x => x.label === label)?.status).not.toBe('verified');
    }
  });
});

describe('P0 成本与步骤不能用未知冒充免费', () => {
  it('无成本证据时生成未知值，而非默认零', () => {
    const cost = costFromSource(project());
    expect(cost.capital_max_usd).toBeNull();
    expect(cost.gas_estimate_usd).toBeNull();
  });
  it('Allox 完整教程的资金与手续费要求覆盖旧的零值', () => {
    const raw = JSON.parse(readFileSync('data/details/allox.json', 'utf8')) as AirdropProject;
    const p = buildGuideAndCost({ ...raw, cost: { ...raw.cost, capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0 } });
    expect(p.cost.capital_max_usd).toBeNull();
    expect(p.cost.gas_estimate_usd).toBeNull();
    expect(p.cost.summary).toContain('本金');
    expect(beginnerVerdict(toListProject(p)).friendly).toBe(false);
    expect(applyCostBucket(toListProject(p), 'free')).toBe(false);
    const step = p.guide.find(g => g.original_title === 'Fund Your Wallet on BNB Chain');
    expect(step?.cost_usd).toBeNull();
    expect(step?.needs_wallet).toBe(true);
    expect(step?.risk).not.toBe('low');
  });
  it('普通邮箱注册不会误判成钱包签名', () => {
    const steps = stepsFromSource(project({ sourcedSteps: [
      { title: 'Create Account', body: 'Sign up with an email and password. Verify your email.' } ] }));
    expect(steps[0].needs_signature).toBe(false);
    expect(steps[0].needs_wallet).toBe(false);
  });
  it('签名未说明的步骤不能自动判定无需签名', () => {
    const steps = stepsFromSource(project({ sourcedSteps: [{ title: '任务', body: 'Complete the task on the page.' }] }));
    expect(steps[0].needs_signature).toBeNull();
    expect(steps[0].cost_usd).toBeNull();
  });
  it('来源明确无需本金且无需手续费时，可记录零成本', () => {
    const p = project({ tagline: 'No capital required. No gas fees. This is a free activity.' });
    expect(costFromSource(p).capital_max_usd).toBe(0);
    expect(costFromSource(p).gas_estimate_usd).toBe(0);
  });
  it('未知成本在最低成本排序中位于已知成本之后', () => {
    const unknown = toListProject(project({ slug: 'unknown', cost: { ...project().cost,
      capital_min_usd: null, capital_max_usd: null, gas_estimate_usd: null } as AirdropProject['cost'] }));
    const known = toListProject(project({ slug: 'known', cost: { ...project().cost, capital_min_usd: 10, capital_max_usd: 20, gas_estimate_usd: 1 } }));
    expect(sortProjects([unknown, known], 'cost').map(p => p.slug)).toEqual(['known', 'unknown']);
    expect(beginnerVerdict(unknown).friendly).toBe(false);
    expect(applyCostBucket(unknown, 'free')).toBe(false);
  });
});

describe('P0 活动状态必须有公告且能处理矛盾', () => {
  it.each(['has not confirmed an airdrop', 'not yet confirmed', '尚未确认空投', 'claim is not open'])('归一化否定状态不会变成肯定：%s', text => {
    expect(['confirmed', 'claim_live']).not.toContain(normalizeStatus(text));
  });
  it('已确认与简介否定冲突时显示待核实，FAQ 不再断言官方确认', () => {
    const p = reconcileAll([project({ status: 'confirmed', tagline: 'AlloX has not confirmed an airdrop.' })]).projects[0];
    expect(p.status).toBe('pending');
    expect(generateFaq(p)[0].a).not.toContain('官方渠道已有明确信号');
  });
  it('单纯聚合站称 confirmed/live 不足以确认活动', () => {
    const p = reconcileAll([project({ status: 'potential', tagline: 'The airdrop is confirmed.' })]).projects[0];
    expect(p.status).toBe('pending');
  });
  it('较新的具体人工核验公告可恢复领取状态', () => {
    const p = project({ status: 'confirmed', tagline: '尚未确认空投',
      evidence: [reviewed('official_announcement', 'https://demo.example/claim-announcement', 'claim_live')] });
    expect(reconcileAll([p]).projects[0].status).toBe('claim_live');
  });
  it('缺少活动阶段的公告或早于冲突来源的公告不能恢复肯定状态', () => {
    const proof = reviewed('official_announcement', 'https://demo.example/announcement', 'confirmed');
    const noStage = { ...proof, activity_status: undefined };
    const old = { ...proof, verification: { ...proof.verification!, checked_at: '2026-09-01T12:00:00.000Z' } };
    for (const evidence of [[noStage], [old]]) {
      expect(reconcileAll([project({ status: 'confirmed', tagline: '尚未确认空投', evidence })]).projects[0].status).toBe('pending');
    }
  });
  it('原始描述后半段的否定和资金要求不能被卡片截断隐藏', () => {
    const p = project({ status: 'confirmed', evidence: [reviewed('official_announcement', 'https://demo.example/announcement', 'confirmed')] });
    const incoming = { slug: 'demo', name: 'Demo', tagline: '项目介绍', status: 'confirmed',
      chains: [], sourceType: 'airdrop_aggregator' as const, sourceName: 'Airdrops.io',
      sourceUrl: 'https://airdrops.io/demo/', officialUrl: '', fetchedAt: at, rawTitle: 'Demo',
      description: 'Demo is a community project with a long introduction. ' + 'Project background. '.repeat(20) +
        'The team has not confirmed an airdrop. Deposit funds and pay gas fees to use the product.' };
    const next = applySourced({ ...p, sources: [{ ...p.sources[0], fetched_at: '2026-09-24T12:00:00.000Z' }] }, incoming);
    expect(reconcileAll([next]).projects[0].status).toBe('pending');
    expect(costFromSource(next).capital_required).toBe(true);
    expect(costFromSource(next).gas_required).toBe(true);
  });
  it('来源描述更新阶段与旧公告不同，应待核实；同一时刻的矛盾公告也不能选边', () => {
    const old = reviewed('official_announcement', 'https://demo.example/announcement', 'confirmed');
    const p = project({ status: 'confirmed', tagline: 'The claim is open.', evidence: [old],
      sources: [{ ...project().sources[0], fetched_at: '2026-09-24T12:00:00.000Z' }] });
    expect(reconcileAll([p]).projects[0].status).toBe('pending');
    const conflict = reviewed('official_announcement', 'https://demo.example/claim', 'claim_live');
    conflict.verification!.checked_at = '2026-09-23T20:00:00.000+08:00';
    expect(reconcileAll([project({ status: 'confirmed', evidence: [old, conflict] })]).projects[0].status).toBe('pending');
  });
  it('明确整体结束保持结束，不因旧确认文字重新开放', () => {
    expect(reconcileAll([project({ status: 'claim_live', tagline: 'The airdrop has ended.' })]).projects[0].status).toBe('ended');
    expect(reconcileAll([project({ status: 'ended', tagline: 'The airdrop is confirmed.' })]).projects[0].status).toBe('ended');
  });
});
