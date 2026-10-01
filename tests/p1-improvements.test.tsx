import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { toSkeleton } from '../scripts/lib/merge';
import { buildGuide } from '../scripts/lib/guide';
import { stepsFromSource, tasksFromSource } from '../scripts/lib/sourced';
import { loadCache, localizeText } from '../scripts/i18n/translate.mjs';
import { EXIT_ITEMS } from '../src/components/ExitChecklist';
import { canExecuteGuide } from '../src/lib/guide';
import { reviewedEvidence } from './helpers/evidence';
import { DetailView } from '../src/pages/DetailView';
import { RefreshBar } from '../src/components/RefreshBar';
import { riskExplain } from '../src/lib/risk';
import { SCAM_TYPES } from '../src/lib/scam';

const base = () => toSkeleton({ slug: 'demo', name: '测试项目', sourceType: 'airdrop_aggregator', sourceName: '测试来源', sourceUrl: 'https://example.org/demo', fetchedAt: '2026-09-22T00:00:00Z' });
loadCache(JSON.parse(readFileSync('scripts/i18n/cache.zh.json', 'utf8')));

describe('P1 中文与研究边界', () => {
  it('未翻译的新步骤保留完整原文并暂停操作', () => {
    const raw = 'Complete the brand new eligibility check. '.repeat(20);
    const steps = stepsFromSource({ ...base(), sourcedSteps: [{ title: 'Brand New Financial Task', body: raw }] });
    expect(steps[0].title).toBe('中文教程待核实');
    expect(steps[0].description).toContain('暂停');
    expect(steps[0].original_description).toBe(raw);
    expect(steps[0].content_status).toBe('pending_translation');
    expect(steps[0].official_url).toBe('');
  });
  it('模板只有资料核对，不要求资金操作或钱包签名', () => {
    const { steps, source } = buildGuide({ ...base(), tasks: ['存入资产', '开仓交易'] });
    expect(source).toBe('template');
    expect(steps.map(s => s.title).join(' ')).toContain('核对');
    expect(steps.some(s => s.needs_wallet || s.needs_signature)).toBe(false);
    expect(steps.map(s => s.description).join(' ')).not.toContain('完成核心链上任务');
  });
  it('借贷/交易分类不构成奖励任务', () => {
    expect(tasksFromSource('Lending')).toEqual([]);
    expect(tasksFromSource('Dexs')).toEqual([]);
  });
  it('TBook 的 100 亿是代币数量，不是美元', () => {
    const text = localizeText('The airdrop is confirmed in TBook’s tokenomics, which reserves 7.5% of the fixed 10 billion $BOOK supply, or 750 million tokens.').zh;
    expect(text).toContain('100 亿枚 $BOOK');
    expect(text).toContain('7.5 亿');
    expect(text).not.toContain('亿美元');
  });
  it('邀请经验值的两种来源表述均保留邀请含义', () => {
    for (const raw of [
      'Your balance splits into Task XP, Referral XP and a running total. Check after each quest to confirm credited points, since social verification sometimes needs a refresh.',
      'Your balance splits into Task XP, Referral XP and a running total. Check after each quest to confirm points registered, since social verifications sometimes need a refresh.',
    ]) {
      const text = localizeText(raw).zh;
      expect(text).toContain('邀请经验值（Referral XP）');
      expect(text).toContain('累计总额');
    }
  });
  it('官方活动仍须中文齐备，缺少翻译状态的遗留步骤不直接开放', () => {
    const p = { ...base(), status: 'confirmed' as const, guide_source: 'sourced' as const,
      guide: stepsFromSource({ ...base(), sourcedSteps: [{ title: '核对活动资格', body: '查看官方资格条件。' }] }) };
    expect(canExecuteGuide(p)).toBe(true);
    expect(canExecuteGuide({ ...p, status: 'pending' })).toBe(false);
    expect(canExecuteGuide({ ...p, guide_source: 'third_party' })).toBe(false);
    expect(canExecuteGuide({ ...p, guide: p.guide.map(g => ({ ...g, content_status: undefined })) })).toBe(false);
  });
  it('签到不是钱包签名', () => {
    const steps = stepsFromSource({ ...base(), sourcedSteps: [{ title: 'Build a Sign-In Streak', body: 'Sign-in every day to earn rewards.' }] });
    expect(steps[0].needs_signature).not.toBe(true);
  });
  it('一汉字不能掩盖未翻译的资金操作，原文也不能丢失', () => {
    const raw = '中文提示: Send 500 USDT to the pool, approve unlimited spending and repeat every day.';
    const steps = stepsFromSource({ ...base(), sourcedSteps: [{ title: '中文提示: Deposit 500 USDT', body: raw }] });
    expect(steps[0].content_status).toBe('pending_translation');
    expect(steps[0].original_description).toBe(raw);
    const ready = stepsFromSource({ ...base(), sourcedSteps: [{ title: '连接钱包（Connect Wallet）', body: '阅读服务条款（Terms of Service），核对 MetaMask 钱包提示。' }] });
    expect(ready[0].content_status).toBe('ready');
  });
  it('混合来源补译后能退出等待状态，不被已有汉字短路', () => {
    const raw = '中文提示: Send 500 USDT to the pool and approve unlimited spending.';
    const cache = JSON.parse(readFileSync('scripts/i18n/cache.zh.json', 'utf8'));
    loadCache({ ...cache, [raw]: '来源称需向池中发送 500 USDT 并进行无限额度授权；该操作尚未核验。' });
    try {
      expect(stepsFromSource({ ...base(), sourcedSteps: [{ title: '核对资金规则', body: raw }] })[0].content_status).toBe('ready');
    } finally { loadCache(cache); }
  });
  it('所有具体步骤有核验记录时才称为官方教程，安全说明不阻断中文教程', () => {
    const evidence = ['a', 'b', 'c'].map(k => reviewedEvidence('official_guide', `https://example.org/${k}`));
    const p = { ...base(), status: 'confirmed' as const, evidence,
      sourcedSteps: ['a', 'b', 'c'].map(k => ({ title: '核对资格', body: '查看当前活动说明。', url: `https://example.org/${k}` })) };
    const built = buildGuide(p);
    expect(built.source).toBe('sourced');
    expect(canExecuteGuide({ ...p, guide: built.steps, guide_source: built.source })).toBe(true);
  });
  it('详情页保留第三方原文，但不开放操作控件或交易入口', () => {
    const old = JSON.parse(readFileSync('data/details/acepyr.json', 'utf8'));
    const html = renderToStaticMarkup(<DetailView project={old} favorited={false} onToggleFavorite={() => {}} onSetProgress={() => {}} onToggleStep={() => {}} onBack={() => {}} />);
    expect(html).toContain('研究资料与核对清单');
    expect(html).toContain('查看英文原文对照');
    expect(html).toContain('仅供研究');
    expect(html).not.toContain('打开候选项目页面（未核实）↗');
    expect(html).toContain('disabled=""');
  });
});

describe('P1 安全说明边界', () => {
  const text = EXIT_ITEMS.map(item => item.why + renderToStaticMarkup(<>{item.how}</>)).join(' ');
  it('解释真实授权机制与断开连接的区别', () => {
    expect(text).toContain('ERC-20');
    expect(text).toContain('NFT');
    expect(text).toContain('断开');
    expect(text).not.toContain('白名单 / 黑名单');
    expect(text).not.toContain('转回你的常用钱包');
  });
  it('凭据泄露和已完成转账不能靠撤销授权修复', () => {
    expect(text).toContain('助记词');
    expect(text).toContain('已经转走');
    expect(text).toContain('陌生代币');
  });
  it('详情风险提示不把所有签名说成不可取消，也不只凭领取按钮判断安全', () => {
    const tip = riskExplain('medium');
    expect(tip.means).not.toContain('签名一旦发出就无法撤销');
    expect(tip.action).toContain('授权对象');
    expect(tip.action).toContain('按钮名称');
    expect(riskExplain('critical').action).toContain('已知资产');
    expect(riskExplain('critical').action).toContain('不要盲目补充手续费');
    expect(SCAM_TYPES.find(s => s.id === 'fake-support')?.aftermath).toContain('判断');
    expect(SCAM_TYPES.find(s => s.id === 'fake-claim-sign')?.clues.join(' ')).toContain('Claim 也不能证明安全');
  });
});

it('未配置的来源不计入抓取失败覆盖提示', () => {
  const time = '2026-10-01T00:00:00Z';
  const html = renderToStaticMarkup(<RefreshBar index={{ updated_at: time, total: 1, sources: [{ source: '正常', source_url: 'https://example.org', fetched_at: time, count: 1, file: 'live/test.json' }] }} totalProjects={2} health={{ updated_at: time, sources: [
    { name: '正常', url: 'https://example.org', status: 'success', ok: true, fetched: 1, checked_at: time },
    { name: 'X (Twitter)', url: 'https://x.com', status: 'not_configured', ok: false, fetched: 0, checked_at: time },
  ] }} />);
  expect(html).toContain('尚未接入访问凭据');
  expect(html).not.toContain('本轮抓取失败');
});
