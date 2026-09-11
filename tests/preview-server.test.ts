/**
 * 预览服务器回归测试。
 *
 * 背景：Issue #1 反馈「打开预览链接报 404」。根因有两点：
 *   1. dist/ 是构建产物（.gitignore 忽略），若构建未产出就会被当成空壳服务，
 *      服务器仍监听 8686 → 平台判定「就绪」→ 打开预览即 404；
 *   2. 越界路径 /../xxx 会逃逸出 dist/，静态资源缺失又被 SPA 回退伪装成 200。
 *
 * 本测试把「路径解析 + 安全检查」抽成纯函数校验，防止以上问题回归。
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';

const DIST = path.resolve('/app/dist');
const INDEX = path.join(DIST, 'index.html');

/** 与 .ide/preview-server.mjs 中 resolveFile 的判定逻辑保持一致。 */
function resolve(urlPath: string):
  | { kind: 'file'; filePath: string }
  | { kind: 'fallback'; filePath: string }
  | { kind: 'forbidden' }
  | { kind: 'notfound' } {
  const rawSegments = urlPath.split(/[\\/]+/);
  if (rawSegments.includes('..')) return { kind: 'forbidden' };

  const normalized = path.posix.normalize(urlPath);
  const rel = normalized.replace(/^\/+/, '');
  const filePath = path.resolve(DIST, rel);

  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    return { kind: 'forbidden' };
  }

  // 模拟文件存在性：只认这些已知存在的路径
  const EXISTING = new Set([
    INDEX,
    path.join(DIST, 'data', 'airdrops.json'),
    path.join(DIST, 'favicon.svg'),
  ]);

  if (EXISTING.has(filePath)) return { kind: 'file', filePath };

  const isAssetLike =
    path.posix.extname(rel) !== '' || rel.startsWith('assets/') || rel.startsWith('data/');
  if (!isAssetLike) return { kind: 'fallback', filePath: INDEX };

  return { kind: 'notfound' };
}

describe('预览服务器 · 目录穿越防护', () => {
  it.each([
    '/../package.json',
    '/../../etc/passwd',
    '/..%2fpackage.json'.replace('%2f', '/'),
    '/data/../../package.json',
    '/../.cnb.yml',
    '/../.gitignore',
  ])('越界路径应被拒绝：%s', (p) => {
    expect(resolve(p).kind).toBe('forbidden');
  });

  it('正常路径不应被误判为越界', () => {
    expect(resolve('/data/airdrops.json').kind).toBe('file');
    expect(resolve('/index.html').kind).toBe('file');
  });
});

describe('预览服务器 · 路由语义', () => {
  it('已知文件返回 200', () => {
    expect(resolve('/data/airdrops.json')).toEqual({
      kind: 'file',
      filePath: path.join(DIST, 'data', 'airdrops.json'),
    });
  });

  it('页面级未命中路由回退 index.html', () => {
    expect(resolve('/project/monad').kind).toBe('fallback');
    expect(resolve('/whatever').kind).toBe('fallback');
  });

  it('缺失的静态资源必须 404，不能被回退伪装成 200', () => {
    // 这是 Issue #1 的关键回归点：资源 404 若被伪装成 HTML，
    // 前端会白屏且无法定位问题。
    expect(resolve('/assets/missing.js').kind).toBe('notfound');
    expect(resolve('/data/details/missing.json').kind).toBe('notfound');
    expect(resolve('/favicon-missing.png').kind).toBe('notfound');
  });
});
