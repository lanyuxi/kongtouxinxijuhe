import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { loadCache } from '../scripts/i18n/translate.mjs';
import { finalizeProject } from '../scripts/lib/finalize';
import { validateProjects } from '../scripts/lib/validate';
import { toListProject } from '../scripts/lib/list';
import { DetailView } from '../src/pages/DetailView';
import { ProjectCard } from '../src/components/ProjectCard';
import { FilterBar } from '../src/components/FilterBar';
import { DEFAULT_FILTERS } from '../src/lib/filter';
import { beginnerVerdict } from '../src/lib/beginner';
import { feedItemSummary } from '../scripts/lib/feed';

beforeAll(() => loadCache(JSON.parse(readFileSync('scripts/i18n/cache.zh.json', 'utf8'))));

function allox(): AirdropProject {
  const p = JSON.parse(readFileSync('tests/fixtures/allox.json', 'utf8')) as AirdropProject;
  return { ...p, status: 'confirmed', tagline: 'AlloX 尚未确认空投，但其奖励系统明显指向空投。',
    cost: { ...p.cost, capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, basis: undefined } };
}

describe('P0 数据生成到用户页面的完整路径', () => {
  it('重复生成幂等，Allox 列表和详情同时退出确认及新手筛选', () => {
    const p = finalizeProject(allox());
    expect(finalizeProject(p)).toEqual(p);
    const list = toListProject(p);
    expect(list.status).toBe('pending');
    expect(p.status).toBe('pending');
    expect(list.cost).toEqual(p.cost);
    expect(list.guide.find(g => g.step === 3)?.needs_wallet).toBe(true);
    expect(beginnerVerdict(list).friendly).toBe(false);
    expect(p.recommendation.action).not.toBe('participate');
    expect(p.scores.risk).not.toBe('low');
  });
  it('真实详情渲染未知成本和候选入口，不输出旧的零成本承诺', () => {
    const p = finalizeProject(allox());
    const html = renderToStaticMarkup(<DetailView project={p} favorited={false}
      onBack={() => {}} onToggleFavorite={() => {}} onSetProgress={() => {}} onToggleStep={() => {}} />);
    expect(html).toContain('状态待核实');
    expect(html).toContain('需要本金，金额待核实');
    expect(html).toContain('需要手续费，金额待核实');
    expect(html).toContain('候选项目页面（未核实）');
    expect(html).not.toContain('低成本、纯时间投入型项目');
    expect(html).not.toContain('$null');
    expect(html).not.toContain('未发现资金或签名要求');
    expect(html).toContain('操作难度待核实');
    expect(html).toContain('成本依据');
    const card = renderToStaticMarkup(<ProjectCard project={toListProject(p)} favorited={false} onToggleFavorite={() => {}} />);
    expect(card).toContain('状态待核实');
    expect(card).toContain('来源简介（待核实）');
    expect(card).not.toMatch(/天前验证/);
    expect(card).not.toContain('🌱 新手友好');
    const summary = feedItemSummary(toListProject(p), 'https://demo.xyz/');
    expect(summary).toContain('候选项目链接（未核实）');
    expect(summary).toContain('金额待核实');
    const filters = renderToStaticMarkup(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} onReset={() => {}} resultCount={1} chainOptions={[]} />);
    expect(filters).toContain('value="pending"');
  });
  it('发布校验拒绝没有核验记录的 verified 标记', () => {
    const p = finalizeProject(allox());
    const fake = { ...p, evidence: [{ type: 'official_website' as const, url: 'https://wrong.example',
      label: '未核实', verified: true }] };
    expect(validateProjects([fake]).errors.some(e => e.includes('核验记录'))).toBe(true);
  });
  it('发布校验拒绝无公告的肯定活动状态', () => {
    const p = finalizeProject(allox());
    expect(validateProjects([{ ...p, status: 'confirmed' }]).errors.some(e => e.includes('活动状态'))).toBe(true);
  });
  it('发布校验拒绝正文要求本金却标为零，允许一致的未知值', () => {
    const p = finalizeProject(allox());
    expect(validateProjects([{ ...p, cost: { ...p.cost, capital_min_usd: 0, capital_max_usd: 0 } }]).errors.some(e => e.includes('本金'))).toBe(true);
    expect(validateProjects([p]).ok).toBe(true);
  });
  it('发布校验拒绝缺少来源依据的金额及仅有网址的假核实教程', () => {
    const p = finalizeProject(allox());
    const noFacts = { ...p, tagline: '待核实活动', tagline_en: undefined, tasks: [], requirements: [], sourcedSteps: [] };
    expect(validateProjects([{ ...noFacts, cost: { ...p.cost, capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, basis: undefined } }]).errors.some(e => e.includes('成本金额缺少来源依据'))).toBe(true);
    const fakeGuide = { ...p, guide_source: 'sourced' as const, guide: [{ ...p.guide[0], source_url: 'https://demo.xyz/guide', source_verified: true }] };
    expect(validateProjects([fakeGuide]).errors.some(e => e.includes('教程核验记录'))).toBe(true);
  });
  it('发布校验拦截未知成本的低风险与推荐参与结论', () => {
    const p = finalizeProject(allox());
    expect(validateProjects([{ ...p, scores: { ...p.scores, risk: 'low' } }]).errors.some(e => e.includes('低风险'))).toBe(true);
    expect(validateProjects([{ ...p, recommendation: { ...p.recommendation, action: 'participate' } }]).errors.some(e => e.includes('推荐参与'))).toBe(true);
  });
});
