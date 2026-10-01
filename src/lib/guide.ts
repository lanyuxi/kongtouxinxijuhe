import type { AirdropProject, ListProject } from './types';

/** 来源可信、活动有效和中文齐备是三个独立条件。 */
export function canExecuteGuide(p: Pick<AirdropProject | ListProject, 'status' | 'guide_source' | 'guide'>): boolean {
  return (p.status === 'confirmed' || p.status === 'claim_live') &&
    p.guide_source === 'sourced' && p.guide.length > 0 &&
    p.guide.every(g => g.content_status === 'ready');
}
