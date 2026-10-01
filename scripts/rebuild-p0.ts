import { collectPendingTranslations } from './i18n/review-queue.mjs';
/** 离线修复已提交的快照，不抓取、不修改最近检查时间、不发布。 */
import { readFile, writeFile } from 'node:fs/promises';
import type { AirdropProject, ListDataset } from '../src/lib/types';
import { loadCache } from './i18n/translate.mjs';
import { applyProfile, loadProfiles } from './lib/enrich';
import { finalizeProject } from './lib/finalize';
import { toListProject } from './lib/list';
import { projectDigest } from './lib/change';
import { validateProjects } from './lib/validate';

loadCache(JSON.parse(await readFile('scripts/i18n/cache.zh.json', 'utf8')));
const dataset = JSON.parse(await readFile('data/airdrops.json', 'utf8')) as ListDataset;
const profiles = await loadProfiles();
const changedAt = new Date().toISOString();
const projects: AirdropProject[] = [];
for (const list of dataset.projects) {
  const old = JSON.parse(await readFile(`data/details/${list.slug}.json`, 'utf8')) as AirdropProject;
  const next = finalizeProject(applyProfile(old, profiles[old.slug]));
  // 同一快照再次生成必须收敛，否则不得写入。
  if (JSON.stringify(finalizeProject(next)) !== JSON.stringify(next)) throw new Error(`${old.slug} 重建未收敛`);
  const digest = projectDigest(next);
  projects.push({ ...next, digest, last_changed_at: digest === projectDigest(old) ? old.last_changed_at : changedAt });
}
const result = validateProjects(projects, new Set(Object.keys(profiles)));
if (!result.ok) throw new Error(result.errors.join('\n'));
for (const p of projects) await writeFile(`data/details/${p.slug}.json`, JSON.stringify(p, null, 2) + '\n');
await writeFile('data/airdrops.json', JSON.stringify({ ...dataset, content_updated_at: projects.map(p => p.last_changed_at).sort().at(-1), projects: projects.map(toListProject) }, null, 2) + '\n');
console.log(`离线修复 ${projects.length} 个项目；保留采集时间 ${dataset.updated_at}；校验警告 ${result.warnings.length} 条。`);

await writeFile('data/translation-pending.json', JSON.stringify(collectPendingTranslations(projects), null, 2) + '\n');
