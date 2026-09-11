/**
 * Airdrops.io 数据源适配器。
 *
 * 说明：MVP 阶段不依赖站点 HTML 结构（易变、易触发反爬），
 * 而是读取项目内维护的 `data/seed/airdrops-io.json` 快照。
 * 快照由维护者按需更新；接真实抓取时只需替换 load()。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, '../../data/seed/airdrops-io.json');

interface SeedEntry {
  title: string;
  url: string;
  description?: string;
  status?: string;
  category?: string;
  chain?: string;
}

export const airdropsIoAdapter: SourceAdapter = {
  name: 'Airdrops.io',
  url: 'https://airdrops.io/latest/',
  async fetch(): Promise<RawItem[]> {
    const raw = JSON.parse(await readFile(SEED, 'utf8')) as { items: SeedEntry[] };
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      throw new Error('Airdrops.io 快照为空');
    }
    const fetchedAt = new Date().toISOString();
    return raw.items.map((e) => ({
      sourceType: 'airdrop_aggregator' as const,
      sourceName: 'Airdrops.io',
      sourceUrl: 'https://airdrops.io/latest/',
      title: e.title,
      url: e.url,
      description: e.description,
      statusText: e.status,
      categoryText: e.category,
      chainText: e.chain,
      fetchedAt,
    }));
  },
};
