/**
 * P2-3｜「一键更新」在 GitHub Pages 上实质是空操作，但文案像真的在抓。
 *
 * 实测问题（上轮审查 P2-3）：
 *   ```ts
 *   // src/lib/refresh.ts
 *   if (!endpoint) return { triggered: false, detail: '未配置触发器，已改为重新拉取最新数据' };
 *   ```
 *   线上是 GitHub Pages，没有配 `VITE_REFRESH_ENDPOINT`，
 *   所以按钮永远是「重新拉取已有 JSON」——**不会产生任何新数据**。
 *   用户点完看到「已更新」，会以为平台实时抓取了。
 *
 * 修复原则（诚实的措辞，而不是隐藏按钮）：
 *   1. 未配置触发器时，按钮改文案为「重新加载最新已发布数据」，
 *      不再用「一键更新」这种承诺性的措辞；
 *   2. 点击后的结果说明必须包含「未触发新抓取」这一事实；
 *   3. 配置了触发器时保持原行为与文案（能力真的存在时不必自我贬低）。
 */
import { describe, it, expect } from 'vitest';
import { refreshCapability, describeRefreshOutcome } from '../src/lib/refresh';

describe('P2-3 一键更新的能力与文案诚实性', () => {
  it('未配置触发器时：能力如实报告为「仅重新加载」', () => {
    const cap = refreshCapability(undefined);
    expect(cap.canTriggerFetch).toBe(false);
    expect(cap.buttonLabel).toBe('重新加载数据');
    expect(cap.note).toContain('不会触发新的抓取');
  });

  it('未配置触发器时按钮文案不得出现「一键更新」这种承诺性措辞', () => {
    const cap = refreshCapability(undefined);
    expect(cap.buttonLabel).not.toContain('一键更新');
    expect(cap.note).not.toContain('已更新到最新数据');
  });

  it('配置了触发器时：保留原有能力表述', () => {
    const cap = refreshCapability('https://example.com/hook');
    expect(cap.canTriggerFetch).toBe(true);
    expect(cap.buttonLabel).toBe('一键更新');
  });

  it('空字符串 / 空白字符串等同于未配置', () => {
    expect(refreshCapability('').canTriggerFetch).toBe(false);
    expect(refreshCapability('   ').canTriggerFetch).toBe(false);
  });

  it('点击后的结果说明必须包含「未抓取」的事实', () => {
    const msg = describeRefreshOutcome({ triggered: false, changed: false, dataChanged: false });
    expect(msg).toContain('重新加载');
    expect(msg).toContain('未触发');
  });

  it('触发了抓取且数据有变化时，说明真实变化', () => {
    const msg = describeRefreshOutcome({ triggered: true, changed: true, dataChanged: true });
    expect(msg).toContain('已更新');
  });

  it('触发了抓取但数据没变化时，不得说「已更新到最新数据」', () => {
    const msg = describeRefreshOutcome({ triggered: true, changed: false, dataChanged: false });
    expect(msg).not.toBe('已更新到最新数据');
    expect(msg).toContain('无内容变化');
  });
});
