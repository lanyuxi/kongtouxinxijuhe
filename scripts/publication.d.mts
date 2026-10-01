import type { ListDataset, Publication } from '../src/lib/types';
export function buildPublication(dataset: Pick<ListDataset, 'updated_at' | 'last_successful_check_at' | 'content_updated_at'>, env?: Record<string, string | undefined>, now?: string): Publication;
