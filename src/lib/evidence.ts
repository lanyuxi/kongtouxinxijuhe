import type { AirdropProject, Evidence } from './types';

/** 网址格式检查仅表示候选链接可展示，不能证明归属、可访问或活动存在。 */
export function isCandidateUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function isEvidenceVerified(e: Evidence): boolean {
  const v = e.verification;
  return e.verified === true && !!v && v.method === 'manual_review' &&
    isCandidateUrl(e.url) && isCandidateUrl(v.source_url) && !!v.note?.trim() &&
    Number.isFinite(Date.parse(v.checked_at)) && Date.parse(v.checked_at) <= Date.now();
}

export function verifiedWebsite(p: Pick<AirdropProject, 'official' | 'evidence'>): string | undefined {
  return p.evidence.some(e => e.type === 'official_website' &&
    e.url === p.official.website && isEvidenceVerified(e)) ? p.official.website : undefined;
}
