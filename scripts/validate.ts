/**
 * 独立校验脚本：可接入 CI，作为发布前的质量门禁。
 *
 * 用法：npm run validate
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AirdropProject, Dataset } from '../src/lib/types';
import { validateProjects, scanForSecrets } from './lib/validate';
import { isProjectVerified } from './lib/verify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function collectSourceFiles(dir: string): Promise<{ file: string; content: string }[]> {
  const out: { file: string; content: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectSourceFiles(full)));
    } else if (/\.(ts|tsx|css|html)$/.test(e.name)) {
      out.push({ file: path.relative(ROOT, full), content: await readFile(full, 'utf8') });
    }
  }
  return out;
}

async function main() {
  const dataset = JSON.parse(
    await readFile(path.join(ROOT, 'data/airdrops.json'), 'utf8'),
  ) as Dataset;

  const result = validateProjects(dataset.projects);

  // 额外检查：真实性分 >= 70 的项目应至少满足「已验证」门槛
  const suspicious = dataset.projects.filter(
    (p: AirdropProject) => p.scores.authenticity >= 70 && !isProjectVerified(p),
  );

  // 扫描前端源码中的 Secret（不变量 5）
  const secrets = scanForSecrets(await collectSourceFiles(path.join(ROOT, 'src')));

  const errors = [...result.errors, ...secrets.map((s) => `Secret 泄漏：${s}`)];
  const warnings = [...result.warnings];

  console.log(`\n数据集：${dataset.projects.length} 个项目`);
  console.log(`校验通过：${result.ok && errors.length === 0 ? '是' : '否'}`);
  if (warnings.length) {
    console.log(`\n警告 ${warnings.length} 条：`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
  if (suspicious.length) {
    console.log(`\n提示：${suspicious.length} 个项目真实性分较高但未达「已验证」门槛（可接受，需人工复核）`);
  }
  if (errors.length) {
    console.log(`\n错误 ${errors.length} 条：`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    process.exitCode = 1;
  } else {
    console.log('\n✓ 全部检查通过');
  }
}

main().catch((e) => {
  console.error('校验脚本异常：', e);
  process.exitCode = 1;
});
