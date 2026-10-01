import type { Evidence } from '../../src/lib/types';

/** 正向用例必须提供可追溯的核验记录，不能只放 verified 布尔值。 */
export function reviewedEvidence(type: Evidence['type'], url: string, activity_status?: Evidence['activity_status']): Evidence {
  return { type, url, label: '测试中的人工核验记录', verified: true, activity_status,
    verification: { method: 'manual_review', source_url: url, checked_at: '2026-09-20T00:00:00.000Z',
      note: '核对具体页面的项目归属、教程或活动阶段' } };
}
