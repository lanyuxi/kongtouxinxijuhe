/**
 * DefiLlama Rewards 数据源适配器（快照模式）。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, '../../data/seed/defillama.json');

interface SeedEntry {
  title: string;
  url: string;
  description?: string;
  status?: string;
  category?: string;
  chain?: string;
}

export const defiLlamaAdapter: SourceAdapter = {
  name: 'DefiLlama Rewards',
  url: 'https://defillama.com/rewards',
  async fetch(): Promise<RawItem[]> {
    const raw = JSON.parse(await readFile(SEED, 'utf8')) as { items: SeedEntry[] };
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      throw new Error('DefiLlama 快照为空');
    }
    const fetchedAt = new Date().toISOString();
    return raw.items.map((e) => ({
      sourceType: 'rewards_tracker' as const,
      sourceName: 'DefiLlama Rewards',
      sourceUrl: 'https://defillama.com/rewards',
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
