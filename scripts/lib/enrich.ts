/**
 * Enrich：用人工维护的官方档案补全项目信息。
 *
 * 对应方案文档第 27 章不变量 4：
 * 第三方页面提供的链接不能自动被认为是官方链接，必须经过交叉验证。
 * 因此官方链接唯一可信来源是 data/seed/official-profiles.json（人工核实）。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AirdropProject, Evidence } from '../../src/lib/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = path.resolve(__dirname, '../../data/seed/official-profiles.json');

interface Profile {
  official?: AirdropProject['official'];
  meta?: AirdropProject['meta'];
  tasks?: string[];
  requirements?: string[];
  evidence?: Evidence[];
}

interface ProfileFile {
  profiles: Record<string, Profile>;
}

export async function loadProfiles(): Promise<Record<string, Profile>> {
  const raw = JSON.parse(await readFile(PROFILE_FILE, 'utf8')) as ProfileFile;
  return raw.profiles ?? {};
}

export function applyProfile(p: AirdropProject, profile?: Profile): AirdropProject {
  if (!profile) return p;
  return {
    ...p,
    official: { ...profile.official, ...p.official },
    meta: { ...profile.meta, ...p.meta },
    tasks: profile.tasks?.length ? profile.tasks : p.tasks,
    requirements: profile.requirements?.length ? profile.requirements : p.requirements,
    evidence: profile.evidence?.length
      ? dedupeEvidence([...profile.evidence, ...p.evidence])
      : p.evidence,
  };
}

/**
 * 按人工档案内容生成稳定指纹。
 *
 * 为什么需要它：档案是静态文件，每轮都会被应用一次。
 * 如果每轮都无条件改写 last_changed_at，那么「数据变化时间」就会永远等于本轮时间，
 * 用户看到的永远是「刚刚」，完全失去意义。
 * 因此这里只比对档案内容本身，内容没变就不动时间戳。
 */
function profileFingerprint(profile?: Profile): string {
  if (!profile) return '';
  return JSON.stringify({
    official: profile.official ?? {},
    meta: profile.meta ?? {},
    tasks: profile.tasks ?? [],
    requirements: profile.requirements ?? [],
    evidence: profile.evidence ?? [],
  });
}

/**
 * 在项目上记录「本轮应用的人工档案指纹」。
 * 下一轮对比指纹即可知道档案是否真的被人改过。
 */
export function markProfileApplied(p: AirdropProject, profile?: Profile): AirdropProject {
  const fp = profileFingerprint(profile);
  if (!fp) return p;
  if (p.profile_digest === fp) return p;
  return { ...p, profile_digest: fp, last_changed_at: new Date().toISOString() };
}

export async function enrichAll(projects: AirdropProject[]): Promise<AirdropProject[]> {
  const profiles = await loadProfiles();
  return projects.map((p) => {
    if (!profiles[p.slug]) return p;
    return markProfileApplied(applyProfile(p, profiles[p.slug]), profiles[p.slug]);
  });
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const map = new Map<string, Evidence>();
  for (const e of list) {
    const key = `${e.type}::${e.url}`;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values());
}
