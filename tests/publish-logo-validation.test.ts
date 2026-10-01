import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
let fixture: string;
let project: Record<string, unknown>;

beforeAll(async () => {
  fixture = await mkdtemp(path.join(tmpdir(), 'dropscope-publish-'));
  await cp(path.join(root, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  await symlink(path.join(root, 'src'), path.join(fixture, 'src'), 'dir');
  await mkdir(path.join(fixture, 'data/details'), { recursive: true });
  await mkdir(path.join(fixture, 'data/seed'), { recursive: true });
  await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(fixture, 'data/seed/official-profiles.json'), '{"profiles":{"aave-v3":{}}}');
  project = JSON.parse(await readFile(path.join(root, 'data/details/aave-v3.json'), 'utf8'));
});

afterAll(async () => { if (fixture) await rm(fixture, { recursive: true, force: true }); });

describe('发布前图标校验与构建口径一致', () => {
  it.each([
    { label: '无官网及人工图标来源时告警通过', official: {}, manual: {}, logos: {}, ok: true },
    { label: '有官网却缺图标时阻断', official: { website: 'https://example.org' }, manual: {}, logos: {}, ok: false },
    { label: '人工域名来源缺图时阻断', official: {}, manual: { domain: 'example.org' }, logos: {}, ok: false },
    { label: '人工 Llama 来源缺图时阻断', official: {}, manual: { llama: 'aave-v3' }, logos: {}, ok: false },
    { label: '已有映射的文件丢失时阻断', official: {}, manual: {}, logos: { 'aave-v3': 'logos/missing.png' }, ok: false },
  ])('$label', async ({ official, manual, logos, ok }) => {
    await writeFile(path.join(fixture, 'data/details/aave-v3.json'), JSON.stringify({ ...project, official }));
    await writeFile(path.join(fixture, 'data/logo-map.json'), JSON.stringify({ logos }));
    await writeFile(path.join(fixture, 'scripts/logo/mapping.json'), JSON.stringify({ map: { 'aave-v3': manual }, _blocked: {} }));
    let status = 0;
    let output = '';
    try {
      const result = await run(process.execPath, ['--import', 'tsx', 'scripts/validate.ts'], { cwd: fixture });
      output = result.stdout;
    } catch (error) {
      const result = error as { code: number; stdout: string };
      status = result.code;
      output = result.stdout;
    }
    expect(status, output).toBe(ok ? 0 : 1);
    expect(output).toContain(ok ? '未提供图标来源' : 'logo');
  });
});
