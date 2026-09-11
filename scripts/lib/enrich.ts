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
    last_changed_at: new Date().toISOString(),
  };
}

export async function enrichAll(projects: AirdropProject[]): Promise<AirdropProject[]> {
  const profiles = await loadProfiles();
  return projects.map((p) => applyProfile(p, profiles[p.slug]));
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const map = new Map<string, Evidence>();
  for (const e of list) {
    const key = `${e.type}::${e.url}`;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values());
}
