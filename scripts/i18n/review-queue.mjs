import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCache, localizeText, needsTranslation } from './translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 不调用翻译服务；收集完整原文与出处，供人工补译和复核。 */
export function collectPendingTranslations(projects) {
  const pending = new Map();
  const add = (text, project, field) => {
    if (!text || !needsTranslation(text) || !needsTranslation(localizeText(text).zh)) return;
    const entry = pending.get(text) ?? { original: text, locations: [] };
    entry.locations.push({ slug: project.slug, field, source_url: project.sources?.[0]?.url ?? '' });
    pending.set(text, entry);
  };
  for (const p of projects) {
    add(p.tagline_en ?? p.tagline, p, '简介');
    for (const [i, s] of (p.sourcedSteps ?? []).entries()) {
      add(s.title, p, `步骤 ${i + 1} 标题`);
      add(s.body, p, `步骤 ${i + 1} 正文`);
    }
  }
  return { total: pending.size, items: [...pending.values()].sort((a, b) => a.original.localeCompare(b.original, 'en')) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadCache(JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/cache.zh.json'), 'utf8')));
  const projects = readdirSync(path.join(ROOT, 'data/details')).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(readFileSync(path.join(ROOT, 'data/details', f), 'utf8')));
  const queue = collectPendingTranslations(projects);
  writeFileSync(path.join(ROOT, 'data/translation-pending.json'), JSON.stringify(queue, null, 2) + '\n');
  console.log(`[i18n] 待人工补译 ${queue.total} 条，已写入 data/translation-pending.json`);
}
