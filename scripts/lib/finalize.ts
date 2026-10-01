import { localizeCarriedOver } from './sourced';
import type { AirdropProject } from '../../src/lib/types';
import { verifyAll } from './verify';
import { reconcileAll } from './status';
import { buildGuideAndCost, buildFaqAndRisks } from './guide';
import { scoreAll } from './score';
import { versionGuide } from './guide-version';

/** 在线采集与离线修复共用的最终判断；必须在完整来源和人工档案写入之后。 */
export function finalizeProject(p: AirdropProject): AirdropProject {
  const verified = verifyAll([localizeCarriedOver(p)]);
  const reconciled = reconcileAll(verified).projects[0];
  const scored = scoreAll([buildGuideAndCost(reconciled)])[0];
  return versionGuide(buildFaqAndRisks(scored));
}
