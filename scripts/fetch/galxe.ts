/**
 * Galxe Quest 数据源适配器（快照模式）。
 *
 * 方案文档第 42 章：Galxe 视抓取稳定性再加入。
 * 因此本适配器设计为「可失败但不影响整体」——失败时由 runner 隔离。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, '../../data/seed/galxe.json');

interface SeedEntry {
  title: string;
  url: string;
  description?: string;
  status?: string;
  category?: string;
  chain?: string;
}

export const galxeAdapter: SourceAdapter = {
  name: 'Galxe',
  url: 'https://app.galxe.com/quest/explore/all',
  async fetch(): Promise<RawItem[]> {
    let raw: { items: SeedEntry[] };
    try {
      raw = JSON.parse(await readFile(SEED, 'utf8')) as { items: SeedEntry[] };
    } catch (e) {
      throw new Error(`Galxe 快照不可读：${(e as Error).message}`);
    }
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      throw new Error('Galxe 快照为空');
    }
    const fetchedAt = new Date().toISOString();
    return raw.items.map((e) => ({
      sourceType: 'quest_platform' as const,
      sourceName: 'Galxe',
      sourceUrl: 'https://app.galxe.com/quest/explore/all',
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
