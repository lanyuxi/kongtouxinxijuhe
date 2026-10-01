import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 此时只是制品准备完成，实际成功发布时刻由部署运行记录证明。 */
export function buildPublication(dataset, env = {}, now = new Date().toISOString()) {
  return {
    prepared_at: now,
    last_successful_check_at: dataset.last_successful_check_at ?? dataset.updated_at,
    content_updated_at: dataset.content_updated_at ?? null,
    commit_sha: env.GITHUB_SHA ?? null,
    run_url: env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const data = JSON.parse(readFileSync(path.join(root, 'data/airdrops.json'), 'utf8'));
  writeFileSync(path.join(root, 'public/data/publication.json'), JSON.stringify(buildPublication(data, process.env), null, 2) + '\n');
}
