import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import * as store from '../src/lib/store';
import { loadDataset, loadProjectDetail, loadSourceHealth } from '../src/lib/data';
import * as router from '../src/lib/router';
import { DetailView } from '../src/pages/DetailView';
import { ListView } from '../src/pages/ListView';
import { DEFAULT_FILTERS } from '../src/lib/filter';

const project = () => JSON.parse(readFileSync('data/details/aave-v3.json', 'utf8'));
afterEach(() => vi.unstubAllGlobals());

describe('P2 本地备份与教程身份', () => {
  it('导出再导入保留收藏、进度和版本', () => {
    const state = { favorites: ['demo'], progress: { demo: { status: 'doing' as const, completed_steps: [2] } } };
    expect(store.parseBackup(store.serializeBackup(state))).toEqual(state);
  });
  it.each(['{', '{"version":99,"state":{}}', '{"version":1,"state":{"favorites":[42],"progress":{}}}'])('非法备份整体拒绝：%s', text => {
    expect(() => store.parseBackup(text)).toThrow();
  });
  it('超大文件和非法步骤整体拒绝；导出兼容历史 none 记录并排除孤立进度', () => {
    expect(() => store.parseBackup(' '.repeat(1_000_001))).toThrow('1 MB');
    expect(() => store.parseBackup(JSON.stringify({version:1,state:{favorites:['a'],progress:{a:{status:'doing',completed_steps:[-1]}}}}))).toThrow('进度');
    expect(store.parseBackup(store.serializeBackup({ favorites:['a'], progress:{a:{status:'none',completed_steps:[2]},orphan:{status:'done',completed_steps:[1]}}}))).toEqual({favorites:['a'],progress:{a:{status:'saved',completed_steps:[]}}});
  });
  it('合并备份不会覆盖已有记录，也不丢失已有收藏', () => {
    const local = { favorites: ['a'], progress: { a: { status: 'doing' as const, completed_steps: [2] } } };
    const incoming = { favorites: ['a', 'b'], progress: { a: { status: 'saved' as const, completed_steps: [] }, b: { status: 'preparing' as const, completed_steps: [] } } };
    expect(store.mergeBackup(local, incoming)).toEqual({ favorites: ['a', 'b'], progress: { a: local.progress.a, b: incoming.progress.b } });
  });
  it('采集时间变化不改变教程版本，重排不会把勾选套到其他步骤', async () => {
    const versions = await import('../scripts/lib/guide-version');
    const old = versions.versionGuide(project());
    const next = versions.versionGuide({ ...old, last_checked_at: '2030-01-01', guide: [old.guide[1], old.guide[0], old.guide[2]].map((s: any, i: number) => ({ ...s, step: i + 1 })) });
    const { projectDigest } = await import('../scripts/lib/change');
    expect(projectDigest(old)).toBe(projectDigest(project()));
    expect(versions.versionGuide({ ...old, last_checked_at: '2030-01-01' }).guide_version).toBe(old.guide_version);
    const progress = { status: 'doing' as const, completed_steps: [1], guide_version: old.guide_version, completed_step_ids: [old.guide[0].id] };
    const resolved = store.resolveGuideProgress(next, progress)!;
    expect(resolved.completed_steps).toEqual([2]);
    expect(resolved.needs_review).toBe(true);
  });
  it('步骤正文变化与遗留序号均要求复核，不沿用错误完成记录', async () => {
    const versions = await import('../scripts/lib/guide-version');
    const old = versions.versionGuide(project());
    const next = versions.versionGuide({ ...old, guide: old.guide.map((s: any, i: number) => i ? s : { ...s, description: '新的活动条件，需要重新核验。' }) });
    expect(store.resolveGuideProgress(next, { status: 'done', completed_steps: [1], guide_version: old.guide_version, completed_step_ids: [old.guide[0].id] })).toMatchObject({ status: 'doing', completed_steps: [], needs_review: true });
    expect(store.resolveGuideProgress(next, { status: 'doing', completed_steps: [1] })).toMatchObject({ completed_steps: [], needs_review: true });
  });
});

describe('P2 加载失败分类', () => {
  it('网络失败不能归为项目不存在', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    await expect(loadProjectDetail('aave-v3')).rejects.toMatchObject({ kind: 'network' });
  });
  it.each(['guide','cost','meta','evidence'])('嵌套损坏的 %s 不能进入详情渲染', async field => {
    const p=project();
    if(field==='guide') p.guide=[null];
    if(field==='cost') p.cost.summary={};
    if(field==='meta') p.meta={investors:[{}]};
    if(field==='evidence') p.evidence=[{url:'https://example.com',verification:{note:{}}}];
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(p)));
    await expect(loadProjectDetail('aave-v3')).rejects.toMatchObject({kind:'invalid'});
  });
  it('列表条目损坏与完整详情分别守住加载边界', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({projects:[{slug:'broken'}],updated_at:'2026-10-01'})));
    await expect(loadDataset()).rejects.toMatchObject({kind:'invalid'});
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(project())));
    await expect(loadProjectDetail('aave-v3')).resolves.toMatchObject({slug:'aave-v3'});
  });
  it('重新加载与可选来源信息也拒绝损坏内容', async () => {
    const { reloadDataset } = await import('../src/lib/refresh');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({projects:[{slug:'broken'}],updated_at:'2026-10-01'})));
    await expect(reloadDataset()).resolves.toBeNull();
    vi.stubGlobal('fetch', async () => new Response('{}'));
    await expect(loadSourceHealth()).resolves.toBeNull();
  });
  it('404 与数据损坏分别报告', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadProjectDetail('aave-v3')).rejects.toMatchObject({ kind: 'not_found' });
    vi.stubGlobal('fetch', async () => new Response('{broken', { status: 200 }));
    await expect(loadProjectDetail('aave-v3')).rejects.toMatchObject({ kind: 'invalid' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ slug: 'aave-v3' }), { status: 200 }));
    await expect(loadProjectDetail('aave-v3')).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('P2 页面路径与信息层次', () => {
  it('详情返回原列表，直达详情有最新列表兜底', () => {
    expect(router.listReturnTarget('#/watchlist')).toBe('#/watchlist');
    expect(router.listReturnTarget('#/hot')).toBe('#/hot');
    expect(router.listReturnTarget('#/project/demo')).toBe('#/latest');
    vi.stubGlobal('window', {history:{state:{airdropReturn:'#/watchlist'}}});
    expect(router.detailReturnTarget()).toBe('#/watchlist');
  });
  it('筛选与统计面板先于项目，热门真实空态不要求放宽筛选', () => {
    const props = { projects: JSON.parse(readFileSync('data/airdrops.json','utf8')).projects, updatedAt: '2026-10-01', favorites: [], progress: {}, liveIndex: null, refreshing: false, refreshMessage: null, onRefresh: () => {}, onToggleFavorite: () => {}, onClearAll: () => {}, filters: DEFAULT_FILTERS };
    const latest = renderToStaticMarkup(<ListView {...props} view="latest" />);
    expect(latest.indexOf('搜索项目')).toBeLessThan(latest.indexOf('数据总览'));
    expect(latest.indexOf('数据总览')).toBeLessThan(latest.indexOf('查看 Aave V3 详情'));
    const hot = renderToStaticMarkup(<ListView {...props} view="hot" />);
    expect(hot).toContain('尚无达到');
    expect(hot).not.toContain('试试放宽筛选条件');
  });
  it('详情教程在评分之前、资料区只出现一次，未收藏控件明确禁用', () => {
    const html = renderToStaticMarkup(<DetailView project={project()} favorited={false} onToggleFavorite={() => {}} onSetProgress={() => {}} onToggleStep={() => {}} onBack={() => {}} />);
    expect(html.indexOf('id="guide"')).toBeLessThan(html.indexOf('三项独立评分'));
    expect(html.match(/>项目资料<\/h2>/g)).toHaveLength(1);
    expect(html).toContain('先收藏后可记录步骤');
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(html).toContain('github.com/lanyuxi/kongtouxinxijuhe/issues/new?');
  });
});
