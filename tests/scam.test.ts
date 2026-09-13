/**
 * 骗局识别与域名自查的单元测试。
 *
 * 这块直接决定用户「会不会因为自查结果而误以为某个站点安全」，
 * 因此必须把「不确定就不给安全结论」这条底线锁进测试。
 */

import { describe, it, expect } from 'vitest';
import {
  SCAM_TYPES,
  buildOfficialDomains,
  checkDomain,
  hostOf,
  levenshtein,
  looksLikeAddress,
  registrableDomain,
} from '../src/lib/scam';

const OFFICIAL = buildOfficialDomains([
  { slug: 'uniswap-v3', name: 'Uniswap V3', official: { website: 'https://app.uniswap.org' } },
  { slug: 'aave-v3', name: 'Aave V3', official: { website: 'https://aave.com/' } },
  { slug: 'layerzero', name: 'LayerZero', official: { website: 'https://layerzero.network' } },
]);

describe('域名工具', () => {
  it('hostOf 去掉协议、路径与 www', () => {
    expect(hostOf('https://www.aave.com/swap?x=1')).toBe('aave.com');
    expect(hostOf('app.uniswap.org')).toBe('app.uniswap.org');
    expect(hostOf('')).toBe('');
    expect(hostOf('这不是网址')).toBe('');
  });

  it('registrableDomain 正确取注册域', () => {
    expect(registrableDomain('app.uniswap.org')).toBe('uniswap.org');
    expect(registrableDomain('aave.com')).toBe('aave.com');
    expect(registrableDomain('foo.bar.co.uk')).toBe('bar.co.uk');
  });

  it('levenshtein 正确计算编辑距离', () => {
    expect(levenshtein('uniswap', 'uniswap')).toBe(0);
    // uniswap → unisvvap 需要两次替换，因此距离为 2（仍在仿冒判定阈值 ≤2 内）
    expect(levenshtein('uniswap', 'unisvvap')).toBe(2);
    expect(levenshtein('uniswap', 'uniswop')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('识别钱包地址（EVM / Solana）', () => {
    expect(looksLikeAddress('0x' + 'a'.repeat(40))).toBe(true);
    expect(looksLikeAddress('app.uniswap.org')).toBe(false);
    expect(looksLikeAddress('https://aave.com')).toBe(false);
  });
});

describe('域名自查结论', () => {
  it('精确命中官方域名 → official', () => {
    const r = checkDomain('https://aave.com/', OFFICIAL);
    expect(r.verdict).toBe('official');
    expect(r.matched).toBe('aave.com');
  });

  it('官方域名的子域名 → official，但提示子域可能被冒用', () => {
    const r = checkDomain('https://app.aave.com/claim', OFFICIAL);
    expect(r.verdict).toBe('official');
    expect(r.detail).toContain('子域');
  });

  it('同主域但主机名不同 → lookalike', () => {
    const r = checkDomain('https://evil.uniswap.org', OFFICIAL);
    expect(r.verdict).toBe('lookalike');
    expect(r.matched).toBe('app.uniswap.org');
  });

  it('差 1 个字母的仿冒域名 → lookalike', () => {
    const r = checkDomain('https://unisvvap.org', OFFICIAL);
    expect(r.verdict).toBe('lookalike');
  });

  it('带 claim / 诱导词的域名 → phishing_signal', () => {
    const r = checkDomain('https://free-airdrop-claim.top', OFFICIAL);
    expect(['phishing_signal', 'lookalike']).toContain(r.verdict);
    expect(r.verdict).not.toBe('official');
  });

  it('陌生域名 → unknown，且明确说明「未收录 ≠ 安全」', () => {
    const r = checkDomain('https://some-unknown-site.example', OFFICIAL);
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain('不等于安全');
  });

  it('钱包地址 → 不当成域名，且给出「先转账才能领」的警示', () => {
    const r = checkDomain('0x' + 'b'.repeat(40), OFFICIAL);
    expect(r.verdict).toBe('unknown');
    expect(r.isAddress).toBe(true);
    expect(r.detail).toContain('先转账');
  });

  it('空输入 / 非法输入 → invalid，不抛出异常', () => {
    expect(checkDomain('', OFFICIAL).verdict).toBe('invalid');
    expect(checkDomain('   ', OFFICIAL).verdict).toBe('invalid');
    expect(checkDomain('!!!', OFFICIAL).verdict).toBe('invalid');
  });

  it('任何输入都不会返回「安全」这种保证性结论', () => {
    const inputs = [
      'https://aave.com',
      'https://evil.uniswap.org',
      'https://free-airdrop.top',
      'https://foo.com',
      '0x' + 'c'.repeat(40),
      '',
    ];
    for (const i of inputs) {
      const r = checkDomain(i, OFFICIAL);
      expect(r.summary).not.toContain('绝对安全');
      expect(r.summary).not.toContain('可以放心');
    }
  });

  it('官方域名映射从项目构建，忽略无官网项目', () => {
    const map = buildOfficialDomains([
      { slug: 'a', name: 'A', official: { website: 'https://a.com' } },
      { slug: 'b', name: 'B' },
      { slug: 'c', name: 'C', official: {} },
    ]);
    expect(Object.keys(map)).toEqual(['a.com']);
  });
});

describe('骗局图鉴', () => {
  it('覆盖关键骗局类型', () => {
    const ids = SCAM_TYPES.map((s) => s.id);
    expect(ids).toContain('fake-site');
    expect(ids).toContain('fake-support');
    expect(ids).toContain('fake-claim-sign');
    expect(ids).toContain('advance-fee');
    expect(ids).toContain('mnemonic-phish');
  });

  it('每条骗局都给出「识破要点」与「中招后怎么办」', () => {
    for (const s of SCAM_TYPES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.appearance.length).toBeGreaterThan(0);
      expect(s.intent.length).toBeGreaterThan(0);
      expect(s.clues.length).toBeGreaterThanOrEqual(2);
      expect(s.aftermath.length).toBeGreaterThan(0);
    }
  });

  it('助记词骗局必须明确说明「输入即等于交出钱包」', () => {
    const s = SCAM_TYPES.find((x) => x.id === 'mnemonic-phish')!;
    const text = [s.appearance, s.intent, ...s.clues, s.aftermath].join(' ');
    expect(text).toContain('助记词');
    expect(text).toContain('钱包');
  });
});
