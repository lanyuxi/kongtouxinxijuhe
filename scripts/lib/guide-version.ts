import { createHash } from 'node:crypto';
import type { AirdropProject } from '../../src/lib/types';

/** 只按步骤实质内容标识，序号和抓取时间不参与身份。 */
export function versionGuide(p: AirdropProject): AirdropProject {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const counts = new Map<string, number>();
  const keys = p.guide.map(({ step: _step, id: _id, ...content }) => hash(content));
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const occurrences = new Map<string, number>();
  const guide = p.guide.map((s, i) => {
    const key = keys[i];
    const n = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, n);
    return { ...s, id: counts.get(key)! > 1 ? `${key}:${n}` : key };
  });
  return { ...p, guide, guide_version: hash([p.guide_source, p.status, guide.map(s => s.id)]) };
}
