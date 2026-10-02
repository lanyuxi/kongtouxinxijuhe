import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { canExecuteGuide } from '../src/lib/guide';
import { DetailView } from '../src/pages/DetailView';
import { buildGuide } from '../scripts/lib/guide';
import { loadCache, localizeText, needsTranslation } from '../scripts/i18n/translate.mjs';

loadCache(JSON.parse(readFileSync('scripts/i18n/cache.zh.json', 'utf8')));
const base = () => JSON.parse(readFileSync('data/details/aave-v3.json', 'utf8')) as AirdropProject;
const allocation = {
  title: 'Check your allocation',
  body: 'Open the Allocation tab. The Rewards Checker shows your USDC amount for Epochs 1 to 19.',
};
const wallet = {
  title: 'Activate the in-app wallet',
  body: 'Set up the wallet built into the dashboard and secure it with a passkey or email code. It’s non-custodial: Grass can’t move your funds and you can export the key at any time.',
};
const claim = {
  title: 'Confirm your claim',
  body: 'Review the amount and confirm. The fees come out of your allocation, so there’s nothing to deposit. When Solana fees spike, Grass suggests waiting a few days before claiming. Full rules are in the Grass Rewards Program Terms .',
};

describe('英文教程直接展示简体中文译文', () => {
  it('Grass 英文步骤显示具体中文，保留完整英文及按钮名、周期、手续费说明', () => {
    const p = { ...base(), sourcedSteps: [allocation, wallet, claim], evidence: [] };
    const result = buildGuide(p);
    expect(result.source).toBe('third_party');
    expect(result.steps.every(g => g.content_status === 'ready')).toBe(true);
    const steps = result.steps.slice(1);
    expect(steps[0].title).toBe('查看获配数量');
    expect(steps[0].description).toContain('Allocation');
    expect(steps[0].description).toContain('第 1 至第 19');
    expect(steps[0].description).toContain('USDC');
    expect(steps[1].description).toContain('通行密钥');
    expect(steps[2].description).toContain('手续费从获配金额中扣除');
    for (const [i, raw] of p.sourcedSteps.entries()) {
      expect(steps[i].original_title).toBe(raw.title);
      expect(steps[i].original_description).toBe(raw.body);
      expect(steps[i].source_verified).toBe(false);
    }
    const translated = { ...p, guide: result.steps, guide_source: result.source };
    expect(canExecuteGuide(translated)).toBe(false);
    const html = renderToStaticMarkup(<DetailView project={translated} favorited={true} onToggleFavorite={() => {}} onSetProgress={() => {}} onToggleStep={() => {}} onBack={() => {}} />);
    expect(html).toContain('查看英文原文对照');
    expect(html).not.toContain('等待中文复核');
    expect(html).not.toContain('中文教程待核实');
  });

  it('来源只有一个英文步骤时也展示中文，不能被模板覆盖', () => {
    const result = buildGuide({ ...base(), sourcedSteps: [allocation], evidence: [] });
    expect(result.source).toBe('third_party');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].title).toBe('查看获配数量');
    expect(result.steps[1].content_status).toBe('ready');
  });

  it('已补译的教程保留原文中的合约地址', () => {
    const raw = 'Doppler’s docs list the XDP contract on Base as 0x07b3D902783c3C12b077508c3B5c00113d1291D0. Add it to your wallet as a custom token, and ignore any other token calling itself XDP.';
    const translated = localizeText(raw);
    expect(needsTranslation(translated.zh)).toBe(false);
    expect(translated.zh).toContain('0x07b3D902783c3C12b077508c3B5c00113d1291D0');
    expect(translated.en).toBe(raw);
  });
});
