/**
 * Guide：新手分步骤教程生成（模板化）。
 *
 * 对应方案文档：
 * - 第 15 章：每个值得参与的项目都生成分步教程
 * - 第 16 章：教程步骤必须能追溯到来源（source_url）
 * - 第 23 章：第一版优先使用 deterministic 模板，不依赖运行时 AI
 * - 第 27 章不变量 6：任何页面不得要求用户输入助记词 / 私钥
 */

import type { AirdropProject, GuideStep, FaqItem } from '../../src/lib/types';
import { costFromSource, stepsFromSource } from './sourced';
import { capitalLabel, gasLabel } from '../../src/lib/cost';

/** 通用安全提示，始终附加在第一步 */
const SAFETY_NOTE = '请使用专用的独立空投钱包，任何时候都不要输入助记词或私钥。';

/**
 * 说明：返回步骤的同时给出来源类型。
 * 前端会据此标注「真实教程」或「流程示意（模板）」，
 * 不允许把模板生成的步骤伪装成官方要求。
 */
export function buildGuide(p: AirdropProject): {
  steps: GuideStep[];
  source: 'sourced' | 'third_party' | 'template';
} {
  // 优先使用「数据源侧的真实步骤」。
  // 对应方案第 16 章：教程步骤必须可追溯到来源。
  // 官方页面给出的 HowTo 天然带来源链接，可信度与可执行性都高于确定性模板，
  // 因此只要拿到真实步骤就用它，模板仅作兜底（拿不到时才生成）。
  //
  /**
   * ⚠️ 判定标准在 2026-09-16 被收紧、随后又细化过一次，最终是三档。
   *
   * 第一版（旧实现）：只看「抓到了 >= 3 条步骤」。
   *   → 聚合站**自己写的推广流程**（夹着 `airdrops.io/goto/bybit/` 返佣跳转）
   *     也被算成官方 HowTo，项目拿到 `sourced`，
   *     连「模板教程最高只能到 B」这道等级上限都被绕开 ——
   *     最终 28 个项目显示「建议参与」，而教程里是
   *     「跨链资金 · 无需离开本页即可在 30 多条链之间兑换」这种广告段。
   *
   * 第二版（本轮初稿）：要求步骤链接指向**项目自己的官方域名**。
   *   → 修复了「伪 sourced」，但实测来源侧带官方链接的步骤 = 0/344，
   *     于是 **100% 降级为 template**。审查指出这会误伤 308 条
   *     **确实有项目特异性**的步骤（「每天玩 Sweepbird」「持有 $CARDS 每月空投」），
   *     让用户以为它们是平台编的通用流程。
   *
   * 第三版（现在）：三档
   *   · 可追溯步骤 >= 3          → `sourced`（官方 HowTo）
   *   · 有实质步骤但无官方链接   → `third_party`（聚合站编辑整理，非官方）
   *   · 步骤不足 / 只有通用流程 → `template`
   *   其中 `third_party` 与 `template` 的**等级上限一致**（最高 B），
   *   保证 P1-2 的修复不被新档位绕开（见 score.ts 的 gradeOfWithGuideTrust）。
   */
  const sourced = stepsFromSource(p);
  const traceable = sourced.filter((g) => g.source_verified);
  if (traceable.length >= 3 && traceable.length === sourced.length) {
    return { steps: withSafetyFirst(p, sourced), source: 'sourced' };
  }
  if (sourced.length >= 3) {
    // 有实质内容（聚合站编辑手写），但没有一条能追溯到官方页面。
    // 步骤照常展示，但如实告知「第三方整理、非官方」。
    return { steps: withSafetyFirst(p, sourced.map(g => ({ ...g, source_verified: false }))), source: 'third_party' };
  }
  return { steps: generateTemplateGuide(p), source: 'template' };
}

/** 兼容入口：只取步骤（不关心来源类型时使用） */
export function generateGuide(p: AirdropProject): GuideStep[] {
  return buildGuide(p).steps;
}

/**
 * 确定性模板教程：数据源未提供 HowTo 时的兜底「流程示意」。
 *
 * ⚠️ 信任不变量（本次修复的核心）：
 *   模板步骤**不是**官方要求，因此：
 *     - source_verified 一律为 false —— 绝不谎称「来源已核实」；
 *     - source_url 一律为空 —— 官网首页只能证明「项目存在」，
 *       不能证明「这一步的操作顺序 / 耗时来自官方」，
 *       拿它冒充步骤来源就是伪造可追溯性。
 *   前端随后据 guide_source==='template' 如实标注为「流程示意（非官方步骤）」。
 *   历史问题：曾经写成 `source_verified: !!officialUrl`，导致 142 个模板项目
 *   在前端显示绿色「✓ 来源已核实」，用户以为步骤经官方确认。
 */
function generateTemplateGuide(p: AirdropProject): GuideStep[] {
  const research = [
    ['核对项目与活动公告', '查看项目资料与来源，寻找具体活动的官方公告。协议存在或提供借贷、交易产品，不代表有空投。', '记录公告链接；没有公告就保留为研究线索。'],
    ['核对资格、期限与成本', '核对参与对象、快照或截止时间、资金与手续费要求。本站尚未收录经核验的条件，不应推定已经满足资格。', '记录可核验的资格和期限；未知项明确标为待核实。'],
    ['等待可核验的中文教程', '在活动和步骤核实前暂停存款、交易、授权等操作。后续核对官方完成标准；研究完成不等于取得空投资格。', '有官方中文步骤及完成标准后再评估是否参与。'],
  ];
  return research.map(([title, description, done_when], i) => ({
    step: i + 1, title, description, done_when,
    official_url: p.official.website ?? '', minutes: 0,
    cost_usd: null, needs_wallet: false, needs_signature: false,
    risk: 'unknown', source_verified: false, content_status: 'ready',
  }));
}

/** 依据已有证据生成 FAQ；未知信息必须明确写「官方暂未公布」 */
export function generateFaq(p: AirdropProject): FaqItem[] {
  const unknown = '相关活动信息待核实，请查看官方公告。';
  const statusLabel: Record<string, string> = {
    new: '刚被发现，尚未确认',
    potential: '潜在空投，尚未正式确认',
    pending: '状态待核实',
    confirmed: '已确认空投',
    claim_live: '已开放领取',
    ended: '已结束',
  };

  return [
    {
      q: '这个空投确认了吗？',
      a: `当前状态：${statusLabel[p.status] ?? '未知'}。${p.status_note ?? '请核对具体活动公告与资格条件。'}`,
    },
    {
      q: '什么时候结束？',
      a: '本站尚未收录经核验的截止时间，请核对具体活动公告；没有截止时间记录不代表活动永久有效。',
    },
    {
      q: '参与需要花钱吗？',
      a: `${capitalLabel(p.cost)}；${gasLabel(p.cost)}。`,
    },
    {
      q: '需要连接钱包吗？',
      a: p.guide_source === 'template' ? '资料核对无需连接钱包，实际活动的钱包要求待核实。' : p.guide.some(g => g.needs_wallet) ? '来源描述涉及钱包，请先核对实际活动要求。' : p.guide.some(g => g.needs_wallet === null) ? '钱包要求待核实。' : '目前明确的步骤不需要连接钱包。',
    },
    {
      q: '需要主网资产吗？',
      a: p.cost.gas_estimate_usd === null ? '手续费与主网资产要求待核实。' : p.cost.gas_estimate_usd > 0 ? '需要主网资产支付手续费。' : '来源说明无需手续费。',
    },
    {
      q: '积分一定会兑换 Token 吗？',
      a: '不一定。积分与 Token 之间没有必然兑换关系，请勿将全部精力投入单一项目。',
    },
    {
      q: '适合新手参与吗？',
      a:
        p.scores.risk === 'low'
          ? '适合。操作难度较低，建议按教程逐步完成。'
          : '存在一定风险，新手请务必先阅读风险提示再决定。',
    },
    {
      q: '领取时间确定了吗？',
      a: p.status === 'claim_live' ? '已进入领取阶段，请以官方页面为准。' : unknown,
    },
  ];
}

export function generateRisks(p: AirdropProject): string[] {
  const risks: string[] = [];
  if (p.scores.risk === 'critical') {
    risks.push('检测到高危行为（如索取私钥 / 助记词），请立即停止参与。');
  }
  if (p.status === 'potential' || p.status === 'new') {
    risks.push('项目尚未确认空投，存在投入后无回报的可能。');
  }
  if (p.cost.long_term) {
    risks.push('需要长期交互，时间成本较高，请合理分配精力。');
  }
  if (p.scores.authenticity < 60) {
    risks.push('真实性置信度偏低，证据不足，建议先观察。');
  }
  risks.push('任何要求输入助记词、私钥或恢复短语的页面都不可信。');
  risks.push('请勿使用主钱包参与实验性项目，避免资产集中风险。');
  return Array.from(new Set(risks));
}

/**
 * 第一阶段：生成教程步骤并推导成本模型。
 *
 * 必须在评分之前调用：参与价值里的「任务投入产出比」依赖 cost.time_minutes，
 * 而成本又由教程步骤推导。顺序颠倒会导致评分滞后一轮。
 */
export function buildGuideAndCost(p: AirdropProject): AirdropProject {
  const { steps: guide, source } = buildGuide(p);
  const next = { ...p, guide, guide_source: source, tasks: source === 'template' ? ['核对活动公告', '核对资格与期限'] : p.tasks };
  return { ...next, cost: buildCost(next, guide) };
}

/**
 * 第二阶段：生成 FAQ 与风险提示。
 *
 * 必须在评分之后调用：FAQ 与风险文案会读取 scores.risk / scores.authenticity，
 * 提前调用会拿到上一轮的评分。
 */
export function buildFaqAndRisks(p: AirdropProject): AirdropProject {
  return { ...p, faq: generateFaq(p), risks: generateRisks(p) };
}

/** 兼容入口：等价于 buildGuideAndCost → Score → buildFaqAndRisks 的完整调用方自行编排 */
export function generateAll(p: AirdropProject): AirdropProject {
  return buildFaqAndRisks(buildGuideAndCost(p));
}

function buildCost(p: AirdropProject, guide: GuideStep[]): AirdropProject['cost'] {
  const facts = costFromSource(p);
  const capital = facts.capital_max_usd ?? null;
  const gas = facts.gas_estimate_usd ?? null;
  const summary = capital === null || gas === null
    ? `${facts.capital_required ? '需要准备本金，金额待核实。' : capital === null ? '本金要求待核实。' : '来源说明无需本金。'}${facts.gas_required ? '需要手续费，金额待核实。' : gas === null ? '手续费待核实。' : '来源说明无需手续费。'}信息不完整，暂不判断为新手友好。`
    : capital === 0 && gas === 0 ? '来源说明无需本金与手续费，请继续核对资格与签名要求。'
    : '存在资金或手续费投入，请结合来源金额与操作风险评估。';
  return { ...p.cost, ...facts, capital_min_usd: facts.capital_min_usd ?? null,
    capital_max_usd: capital, gas_estimate_usd: gas,
    time_minutes: guide.some(g => g.minutes <= 0) ? 0 : guide.reduce((s, g) => s + g.minutes, 0),
    long_term: guide.some(g => /后续持续维护/.test(g.title)), summary };
}

/**
 * 在真实步骤前插入一条「安全检查」首步。
 *
 * 为什么必须补这一步：
 *   聚合站给出的 HowTo 只讲「怎么做」，不会讲「怎么保证不被钓鱼」。
 *   而方案不变量 6 要求任何流程都不能诱导用户暴露助记词 / 私钥，
 *   所以安全提示必须由我们自己放在最前面。
 */
function withSafetyFirst(p: AirdropProject, steps: GuideStep[]): GuideStep[] {
  const officialUrl = p.official.website ?? '';
  const safety: GuideStep = {
    step: 1,
    title: '参与前安全检查',
    description: `核对官方域名后再操作。${SAFETY_NOTE}任何要求你输入助记词、私钥或向个人地址转账的页面都是骗局。`,
    official_url: officialUrl,
    minutes: 3,
    cost_usd: 0,
    needs_wallet: false,
    needs_signature: false,
    risk: 'low',
    done_when: '已确认官方域名，并准备好专用的独立空投钱包。',
    // 这一步是「平台自己写的安全提示」，不是官方步骤：
    // 官网链接只能作为「去哪核对域名」的入口，不能当作本步骤的官方来源。
    // 因此 source_verified 必须为 false，避免把平台提示伪装成官方核实结果。
    source_verified: false,
    content_status: 'ready',
  };
  return [safety, ...steps.map((s, i) => ({ ...s, step: i + 2 }))];
}
