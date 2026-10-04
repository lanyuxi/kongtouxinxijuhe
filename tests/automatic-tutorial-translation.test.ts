import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { buildGuide } from '../scripts/lib/guide';
import { getCache, loadCache } from '../scripts/i18n/translate.mjs';
import * as automatic from '../scripts/lib/translate-tutorials';

const source = { title: 'Request New Beta Access', body: 'Connect your wallet to request a place in the next beta.' };
const project = (steps = [source]) => ({ ...JSON.parse(readFileSync('data/details/wager-predict.json', 'utf8')), sourcedSteps: steps }) as AirdropProject;
const reply = (text: string) => new Response(JSON.stringify([[[text, '', null, null]], null, 'en']), { status: 200 });

beforeEach(() => { loadCache({}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('抓取的新英文教程自动翻译', () => {
  it('未收录的新步骤生成中文教程，并保留完整英文原文和来源属性', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const text = new URL(url).searchParams.get('q');
      if (text === source.title) return reply('申请新一轮测试资格');
      if (text === source.body) return reply('连接钱包，申请参加下一轮测试。');
      throw new Error('未知翻译文本');
    });
    const result = await automatic.translateTutorials([project()]);
    expect(result).toEqual({ translated: 2, failed: 0, remaining: 0 });
    const guide = buildGuide(project());
    expect(guide.steps[1].title).toBe('申请新一轮测试资格');
    expect(guide.steps[1].description).toBe('连接钱包，申请参加下一轮测试。');
    expect(guide.steps[1].content_status).toBe('ready');
    expect(guide.steps[1].original_title).toBe(source.title);
    expect(guide.steps[1].original_description).toBe(source.body);
    expect(guide.steps[1].source_verified).toBe(false);
    expect(guide.source).toBe('third_party');
    vi.stubGlobal('fetch', () => { throw new Error('已缓存的教程不应联网'); });
    expect(await automatic.translateTutorials([project()])).toEqual({ translated: 0, failed: 0, remaining: 0 });
  });

  it('网络失败不删除已有中文，下一次抓取可重试同一条英文', async () => {
    loadCache({ [source.title]: '申请新一轮测试资格' });
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    expect(await automatic.translateTutorials([project()])).toEqual({ translated: 0, failed: 1, remaining: 1 });
    expect(getCache()).toEqual({ [source.title]: '申请新一轮测试资格' });
    vi.stubGlobal('fetch', async () => reply('连接钱包，申请参加下一轮测试。'));
    expect(await automatic.translateTutorials([project()])).toEqual({ translated: 1, failed: 0, remaining: 0 });
    expect(buildGuide(project()).steps[1].content_status).toBe('ready');
  });

  it.each(['English instruction only', '中文说明：deposit 100 USDC into the wallet', '中文 ⟦T999⟧'])('拒绝不完整译文 %s，不能污染缓存', async (text) => {
    vi.stubGlobal('fetch', async () => reply(text));
    await automatic.translateTutorials([project([{ title: '', body: source.body }])]);
    expect(getCache()[source.body]).toBeUndefined();
    expect(buildGuide(project([{ title: '', body: source.body }])).steps[1].content_status).toBe('pending_translation');
  });

  it('金额、代币和链接受保护；服务丢失这些内容时拒绝落盘', async () => {
    const body = 'Deposit 25 USDC using https://example.com/claim.';
    vi.stubGlobal('fetch', async (url: string) => {
      const text = new URL(url).searchParams.get('q')!;
      return reply(text.replace('Deposit', '存入').replace('using', '使用'));
    });
    await automatic.translateTutorials([project([{ title: '', body }])]);
    expect(getCache()[body]).toContain('25 USDC');
    expect(getCache()[body]).toContain('https://example.com/claim');
    loadCache({});
    vi.stubGlobal('fetch', async () => reply('存入资产。'));
    await automatic.translateTutorials([project([{ title: '', body }])]);
    expect(getCache()[body]).toBeUndefined();
  });

  it('请求超时有上限，不阻塞其他项目的发布', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('请求超时')));
    }));
    const job = automatic.translateTutorials([project([{ title: '', body: source.body }])]);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await job).toEqual({ translated: 0, failed: 1, remaining: 1 });
  });

  it('教程原文修改后重新翻译，不能误用旧版本的缓存', async () => {
    loadCache({ [source.body]: '连接钱包，申请参加下一轮测试。' });
    const body = 'Disconnect your wallet after leaving the beta page.';
    vi.stubGlobal('fetch', async () => reply('离开测试页面后断开钱包连接。'));
    await automatic.translateTutorials([project([{ title: '', body }])]);
    expect(buildGuide(project([{ title: '', body }])).steps[1].description).toBe('离开测试页面后断开钱包连接。');
    expect(getCache()[source.body]).toBe('连接钱包，申请参加下一轮测试。');
  });

  it('长教程分段翻译后完整合并，英文原文仍完整保留', async () => {
    const body = 'Connect your wallet to request access. '.repeat(100);
    vi.stubGlobal('fetch', async (url: string) => {
      if (new URL(url).searchParams.get('q')!.length > 1200) throw new Error('接口长度超限');
      return reply('连接钱包申请访问资格。');
    });
    expect((await automatic.translateTutorials([project([{ title: '', body }])])).translated).toBe(1);
    const step = buildGuide(project([{ title: '', body }])).steps[1];
    expect(step.description.match(/连接钱包申请访问资格。/g)).toHaveLength(4);
    expect(step.original_description).toBe(body);
  });

  it('服务持续不可用时整轮最多等待两分钟，未处理的文本保留待重试', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('请求超时')));
    }));
    const steps = Array.from({ length: 25 }, (_, i) => ({ title: '', body: `Connect the wallet for beta cohort ${i}.` }));
    const job = automatic.translateTutorials([project(steps)]);
    await vi.advanceTimersByTimeAsync(120_001);
    expect(await job).toEqual({ translated: 0, failed: 24, remaining: 25 });
    expect(getCache()).toEqual({});
  });
});
