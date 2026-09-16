/**
 * 站点品牌标（左上角 logo + 标签页图标）回归测试。
 *
 * 背景：这两处图标此前分头维护 —— 左上角是前端手写的 SVG，
 * 标签页是 public/favicon.svg。改一处忘另一处，就会出现
 * 「页面已换标、标签页还是旧图」的错位，而且在浏览器里只能靠肉眼发现。
 *
 * 因此这里把规则固化：
 *   1. 品牌标只允许有**一份**源图（public/brand-logo.png），且必须是真实 PNG；
 *   2. 左上角组件必须引用它，且不得再退回「纯 SVG 手绘 + 渐变底色」的旧形态；
 *   3. index.html 的 icon 必须指向同一张图，不得再引用旧 favicon.svg；
 *   4. 路径必须能在 GitHub Pages 子路径下解析（不得写死以 / 开头的绝对路径）。
 */

import { describe, it, expect } from 'vitest';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniffImage } from '../scripts/logo/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf8');
}

describe('品牌标源图', () => {
  it('public/brand-logo.png 存在，且是真实且足够清晰的 PNG', async () => {
    const file = path.join(ROOT, 'public/brand-logo.png');
    await access(file);
    const buf = await readFile(file);
    expect(sniffImage(buf), 'brand-logo.png 不是可识别的图片格式').toBe('png');

    const info = await stat(file);
    // 同一张图在 44px 与 32px 两处使用，高 DPI 屏下会放大到 ~132px，
    // 源图过小会直接糊掉，因此这里设一条下限而不是只判断「文件存在」。
    expect(info.size, 'brand-logo.png 体积过小，可能被误存成占位图').toBeGreaterThan(4096);
  });

  it('标签页图标与品牌标同源，且旧的 favicon.svg 已移除', async () => {
    const icon = await readFile(path.join(ROOT, 'public/favicon.png'));
    const brand = await readFile(path.join(ROOT, 'public/brand-logo.png'));
    // 同源是刻意为之：两处各自维护一份源图是「改一半」的根源
    expect(icon.equals(brand), 'favicon.png 与 brand-logo.png 必须是同一张图').toBe(true);

    // 旧图标若继续留在 public/，会被原样发布到线上，容易让人误以为它在生效
    await expect(access(path.join(ROOT, 'public/favicon.svg'))).rejects.toThrow();
  });
});

describe('左上角 logo', () => {
  it('BrandMark 渲染真实图片且引用品牌标源图', async () => {
    const src = await read('src/components/BrandMark.tsx');
    expect(src).toContain('brand-logo.png');
    // 必须真的渲染 <img src=...>，否则「换了图」这件事在页面上不成立
    expect(src).toMatch(/<img[\s\S]*src=\{/);
    // 源图是正方形，必须等比缩放；object-cover 会裁掉降落伞边缘
    expect(src).toContain('object-contain');
    // 品牌标是首屏元素，不能懒加载，否则左上角会闪一次空位
    expect(src).not.toContain('loading="lazy"');
  });

  it('不再保留旧的手绘 SVG 与渐变底色托底', async () => {
    const src = await read('src/components/BrandMark.tsx');
    // 旧形态：内联 <svg viewBox="0 0 24 24"> + from-brand-400 渐变底
    expect(src).not.toMatch(/<svg/);
    expect(src).not.toContain('from-brand-400');
  });

  it('资源路径基于 BASE_URL，能在 GitHub Pages 子路径下解析', async () => {
    const src = await read('src/components/BrandMark.tsx');
    // 写死 '/brand-logo.png' 在 https://<user>.github.io/<repo>/ 下会 404，
    // 而页面本身完全正常 —— 属于最容易漏掉的静默失败
    expect(src).toContain('import.meta.env.BASE_URL');
    expect(src).not.toMatch(/src="\/brand-logo\.png"/);
  });
});

describe('标签页图标', () => {
  it('index.html 的 icon 指向 favicon.png（PNG），且不再引用旧 SVG', async () => {
    const html = await read('index.html');
    expect(html).toMatch(/<link rel="icon" href="\.\/favicon\.png" type="image\/png" \/>/);
    expect(html).not.toContain('favicon.svg');
  });
});

/**
 * 站点自有品牌标不得与项目方 Logo 混用。
 *
 * 项目方 Logo（public/logos/*.png）是各项目的商标，
 * index.html 的社交分享卡片注释里已经写明「刻意不复用项目 logo」。
 * 品牌标换成位图后，这条边界更容易被无意打破（例如直接引用某个项目图），
 * 所以在这里加一条断言把它钉住。
 */
describe('品牌标与项目方 Logo 的边界', () => {
  it('品牌标源图不在 public/logos 目录下', async () => {
    const entries = await readFile(path.join(ROOT, 'public/brand-logo.png'));
    expect(entries.length).toBeGreaterThan(0);
    // 品牌标必须是站点自有图，不能被写成某个项目 logo 的别名
    const logos = await readFile(path.join(ROOT, 'data/logo-map.json'), 'utf8');
    expect(logos).not.toContain('brand-logo.png');
  });

  it('品牌标不在项目图标抓取脚本的清理范围内', async () => {
    const src = await read('scripts/logo/fetch-logos.mjs');
    // 抓取脚本会清理 public/logos 下的「已下线项目」图标；
    // 品牌标若被放进该目录，某次清理就可能把它一起删掉。
    expect(src).not.toContain('brand-logo');
  });
});
