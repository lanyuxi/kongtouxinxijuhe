#!/usr/bin/env node
/**
 * 抓取任务入口（供流水线与本地复用）。
 *
 * 职责：
 *   1. 执行完整数据流水线（抓取 → 归一 → 合并 → 校验 → 写 JSON）
 *   2. 以真实退出码反映结果，并保证 refresh-status.json 一定被写入
 *
 * 为什么单独包一层而不是直接 `tsx scripts/pipeline.ts`：
 *   pipeline 内部已有状态写入与错误落盘，但如果进程被 kill / 依赖缺失导致
 *   tsx 根本没启动，refresh-status.json 就会停留在 running，
 *   前端会一直转圈。这里作为「更外层」的守卫，负责兜住这种情况。
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const STATUS = path.join(DATA, 'refresh-status.json');

async function writeStatus(status) {
  await mkdir(DATA, { recursive: true });
  await writeFile(STATUS, JSON.stringify(status, null, 2) + '\n', 'utf8');
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const startedAt = new Date().toISOString();
await writeStatus({ state: 'running', started_at: startedAt });

const code = await run('npx', ['--no-install', 'tsx', 'scripts/pipeline.ts']);

if (code !== 0) {
  await writeStatus({
    state: 'failed',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error: `数据流水线以非 0 退出码结束（${code}）`,
  });
  console.error(`[refresh] 抓取失败，退出码 ${code}`);
  process.exit(code);
}

console.log('[refresh] 抓取完成');
