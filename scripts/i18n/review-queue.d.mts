import type { AirdropProject } from '../../src/lib/types';
export function collectPendingTranslations(projects: AirdropProject[]): {
  total: number;
  items: { original: string; locations: { slug: string; field: string; source_url: string }[] }[];
};
