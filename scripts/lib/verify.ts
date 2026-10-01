/** 候选链接、抓取记录与人工核验分开。链接数量不能生成官方公告。 */
import type { AirdropProject, Evidence } from '../../src/lib/types';
import { isCandidateUrl, isEvidenceVerified } from '../../src/lib/evidence';

const CHANNELS = [
  ['website', 'official_website', '项目官网候选链接'],
  ['docs', 'official_docs', '项目文档候选链接'],
  ['github', 'official_github', '项目仓库候选链接'],
  ['galxe', 'quest_space', '任务空间候选链接'],
  ['x', 'official_x', '项目 X 候选账号'],
] as const;

export function buildEvidence(p: AirdropProject): Evidence[] {
  const ev = new Map<string, Evidence>();
  const add = (e: Evidence) => ev.set(`${e.type}::${e.url}`, e);
  for (const [key, type, label] of CHANNELS) {
    const url = p.official[key];
    if (!url || !isCandidateUrl(url) || /(^|\.)(airdrops\.io|defillama\.com)$/.test(new URL(url).hostname)) continue;
    add({ type, label, url, verified: false, note: '来源提供的候选链接，归属与可访问性尚未核实' });
  }
  for (const s of p.sources) {
    if (s.type === 'official') continue;
    add({ type: 'third_party', label: `第三方来源记录：${s.name}`, url: s.url,
      verified: false, note: '记录抓取出处，不代表内容已核实或官方背书' });
  }
  if (p.meta?.funding) add({ type: 'funding', label: '融资线索（待核实）',
    url: p.official.website ?? '', verified: false, note: p.meta.funding });

  // 仅保留具体核验记录。重新生成不会清掉有效的人工核验，也不继承旧的假验证。
  for (const e of p.evidence) {
    if (!isEvidenceVerified(e)) continue;
    const channel = CHANNELS.find(([, type]) => type === e.type);
    if (channel && p.official[channel[0]] !== e.url) continue;
    add(e);
  }
  return [...ev.values()];
}

export function isProjectVerified(p: AirdropProject): boolean {
  const official = p.evidence.filter(e => isEvidenceVerified(e) &&
    ['official_website', 'official_announcement', 'official_docs', 'official_github', 'quest_space'].includes(e.type));
  return new Set(official.map(e => e.url)).size >= 2;
}

export function verifyAll(projects: AirdropProject[]): AirdropProject[] {
  return projects.map(p => ({ ...p, evidence: buildEvidence(p) }));
}
