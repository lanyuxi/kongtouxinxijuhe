import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectSources } from '../scripts/lib/sources';
import { collectPendingTranslations } from '../scripts/i18n/review-queue.mjs';
import { buildPublication } from '../scripts/publication.mjs';
import { findMissingLogos } from '../scripts/lib/ensure-logos.mjs';
import { toSkeleton } from '../scripts/lib/merge';
import { applySourced } from '../scripts/lib/sourced';

const now = '2026-10-01T00:00:00Z';
describe('P1 发布与运行状态', () => {
  it('未配置不发请求，真实故障保留最近成功记录，有效结果才算成功', async () => {
    const result = await collectSources([
      { name: '未配置', url: 'https://example.org', configured: () => false, fetch: async () => { throw new Error('不应请求'); } },
      { name: '失效', url: 'https://example.org', fetch: async () => { throw new Error('HTTP 503'); } },
      { name: '正常无变化', url: 'https://example.org', fetch: async () => [{ sourceType: 'third_party', sourceName: '测试', sourceUrl: 'https://example.org', title: '测试项目', url: 'https://example.org/demo', fetchedAt: now }] },
    ], [{ name: '失效', url: 'https://example.org', ok: true, fetched: 1, checked_at: now, last_success_at: '2026-09-30T00:00:00Z' }], now);
    expect(result.health.map(s => s.status)).toEqual(['not_configured', 'failed', 'success']);
    expect(result.health[1].last_success_at).toBe('2026-09-30T00:00:00Z');
    expect(result.snapshots).toHaveLength(1);
  });
  it('全部返回零条不产生成功快照，不把旧数据标成刚检查成功', async () => {
    const result = await collectSources([{ name: '异常空结果', url: 'https://example.org', fetch: async () => [] }], [], now);
    expect(result.health[0].status).toBe('failed');
    expect(result.health[0].last_success_at).toBeUndefined();
    expect(result.snapshots).toEqual([]);
  });
  it('待翻译清单保留来源、字段和完整原文，不依赖在线翻译', () => {
    const original = 'A newly discovered action ' + 'long text '.repeat(100);
    const p = toSkeleton({ slug: 'demo', name: '测试', sourceType: 'third_party', sourceName: '测试', sourceUrl: 'https://example.org', fetchedAt: now });
    const q = collectPendingTranslations([{ ...p, sourcedSteps: [{ title: original }] }]);
    expect(q.total).toBe(1);
    expect(q.items[0].original).toBe(original);
    expect(q.items[0].locations[0].source_url).toBe('https://example.org');
  });
  it('新增长简介在中文查表前不截断，原文及队列保留完整描述', () => {
    const original = 'A completely new financial protocol with eligibility that requires careful checking. ' + 'Further requirements and deadlines have not been reviewed. '.repeat(10);
    const p = toSkeleton({ slug: 'demo', name: '测试', sourceType: 'third_party', sourceName: '测试', sourceUrl: 'https://example.org', fetchedAt: now });
    const next = applySourced(p, { slug: 'demo', name: '测试', title: '测试', sourceType: 'third_party', sourceName: '测试', sourceUrl: 'https://example.org', fetchedAt: now, description: original });
    expect(next.tagline_en).toBe(original);
    expect(collectPendingTranslations([next]).items.some(i => i.original === original)).toBe(true);
  });
  it('构建时间不伪装成实际发布时间，检查与内容变化独立', () => {
    const p = buildPublication({ updated_at: now, content_updated_at: '2026-09-25T00:00:00Z' }, { GITHUB_REPOSITORY: 'lanyuxi/kongtouxinxijuhe', GITHUB_RUN_ID: '123' }, now);
    expect(p.last_successful_check_at).toBe(now);
    expect(p.content_updated_at).toBe('2026-09-25T00:00:00Z');
    expect(p.prepared_at).toBe(now);
    expect(p).not.toHaveProperty('published_at');
    expect(p.run_url).toContain('/actions/runs/123');
  });
  it('无官网且无图标来源的新增项目不阻断整站构建；有官网的真实缺图仍检查', async () => {
    const missing = await findMissingLogos({ dataset: { projects: [{ slug: 'without-site', official: {} }, { slug: 'with-site', official: { website: 'https://example.org' } }] }, map: { logos: {} }, mapping: { map: {}, _blocked: {} } });
    expect(missing).toEqual(['with-site']);
  });
  it('刷新任务直接部署当前制品，不依赖机器人 push 触发其他工作流', () => {
    const yaml = readFileSync('.github/workflows/refresh-data.yml', 'utf8');
    expect(yaml).toContain('actions/upload-pages-artifact@v3');
    expect(yaml).toContain('actions/deploy-pages@v4');
    expect(yaml).toContain('needs: refresh');
    expect(yaml).not.toMatch(/if:.*commit.outputs.changed/);
    expect(yaml).toContain('BASE_PATH: /${{ github.event.repository.name }}/');
  });
});
