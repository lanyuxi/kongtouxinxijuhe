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
import { stepsFromSource } from './sourced';

const MIN = (n: number) => n;

/** 通用安全提示，始终附加在第一步 */
const SAFETY_NOTE = '请使用专用的独立空投钱包，任何时候都不要输入助记词或私钥。';

/**
 * 说明：返回步骤的同时给出来源类型。
 * 前端会据此标注「真实教程」或「流程示意（模板）」，
 * 不允许把模板生成的步骤伪装成官方要求。
 */
export function buildGuide(p: AirdropProject): {
  steps: GuideStep[];
  source: 'sourced' | 'template';
} {
  // 优先使用「数据源侧的真实步骤」。
  // 对应方案第 16 章：教程步骤必须可追溯到来源。
  // 官方页面给出的 HowTo 天然带来源链接，可信度与可执行性都高于确定性模板，
  // 因此只要拿到真实步骤就用它，模板仅作兜底（拿不到时才生成）。
  //
  // ⚠️ P1-2 / P0-1：判定「真实教程」的标准在 2026-09-16 被收紧过一次。
  //    旧实现只看「抓到了 >= 3 条步骤」，于是聚合站**自己写的推广流程**
  //    （夹着 `airdrops.io/goto/bybit/` 返佣链接）也被算成官方 HowTo，
  //    项目因此拿到 `guide_source = 'sourced'`，
  //    连「模板教程最高只能到 B」这道等级上限都被绕开 ——
  //    最终 28 个项目显示「建议参与」，而教程里是
  //    「跨链资金 · 无需离开本页即可在 30 多条链之间兑换」这种广告段。
  //    现在要求：步骤必须指向**该项目自己的官方域名**才算可追溯。
  const sourced = stepsFromSource(p);
  const traceable = sourced.filter((g) => g.source_verified || g.source_url);
  if (traceable.length >= 3) {
    return { steps: withSafetyFirst(p, sourced), source: 'sourced' };
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
type TemplateStep = Omit<GuideStep, 'source_verified' | 'source_url'>;

function generateTemplateGuide(p: AirdropProject): GuideStep[] {

  const steps: TemplateStep[] = [];
  const officialUrl = p.official.website ?? '';
  const needsWallet = /钱包|wallet|galxe|quest|swap|bridge|connect/i.test(
    [p.tagline, ...p.tasks].join(' '),
  );
  const hasSocial = p.tasks.some((t) => /社交|social|follow|discord|x\b/i.test(t));

  let n = 0;

  steps.push({
    step: ++n,
    title: '参与前准备',
    description: `准备一个专用的独立空投钱包，并确认设备环境安全。${SAFETY_NOTE}`,
    official_url: officialUrl,
    minutes: MIN(5),
    cost_usd: 0,
    needs_wallet: false,
    needs_signature: false,
    risk: 'low',
    done_when: '已创建独立钱包，并记录好助记词（仅离线保存，不输入任何网站）。',
  });

  steps.push({
    step: ++n,
    title: '进入官方活动页面',
    description: '点击下方已验证的官方链接。核对浏览器地址栏域名与官网一致后再继续。',
    official_url: officialUrl,
    minutes: MIN(2),
    cost_usd: 0,
    needs_wallet: false,
    needs_signature: false,
    risk: 'low',
    done_when: '页面成功打开，且域名与官方一致。',
  });

  if (needsWallet) {
    steps.push({
      step: ++n,
      title: '连接钱包',
      description: `在官方页面连接上一步准备的独立钱包。${SAFETY_NOTE}`,
      official_url: officialUrl,
      minutes: MIN(2),
      cost_usd: 0,
      needs_wallet: true,
      needs_signature: false,
      risk: 'low',
      done_when: '页面右上角显示钱包地址。',
    });
  }

  if (hasSocial) {
    steps.push({
      step: ++n,
      title: '完成社交任务',
      description: '按官方要求关注 X、加入 Discord 等，并在官方页面完成验证。',
      official_url: p.official.galxe ?? officialUrl,
      minutes: MIN(10),
      cost_usd: 0,
      needs_wallet: true,
      needs_signature: false,
      risk: 'low',
      done_when: '所有社交任务显示为已完成 / Verified。',
    });
  }

  steps.push({
    step: ++n,
    title: '完成核心链上任务',
    description: '按官方说明完成测试网、积分或交互任务。每一步操作前确认合约地址来源官方。',
    official_url: officialUrl,
    minutes: MIN(20),
    cost_usd: p.cost.gas_estimate_usd,
    needs_wallet: true,
    needs_signature: true,
    risk: p.scores.risk === 'low' ? 'low' : 'medium',
    done_when: '任务状态在官方页面显示为已完成。',
  });

  steps.push({
    step: ++n,
    title: '检查任务状态',
    description: '返回官方活动页面，确认所有任务与积分都已正确记录。',
    official_url: officialUrl,
    minutes: MIN(3),
    cost_usd: 0,
    needs_wallet: true,
    needs_signature: false,
    risk: 'low',
    done_when: '所有任务均显示已完成，且积分已计入。',
  });

  if (p.cost.long_term) {
    steps.push({
      step: ++n,
      title: '后续持续维护',
      description: `该项目需要长期交互，建议每周固定时间回访一次，保持活跃。预计周期：4–8 周。`,
      official_url: officialUrl,
      minutes: MIN(10),
      cost_usd: 0,
      needs_wallet: true,
      needs_signature: false,
      risk: 'medium',
      done_when: '形成固定的回访节奏，账户保持活跃。',
    });
  }

  // 信任不变量：模板步骤永远不携带「已核实」标记与伪造的步骤来源。
  // 这里统一兜底，避免后续新增模板步骤时忘记标注而再次出现「假核实」。
  return steps.map((s) => ({ ...s, source_verified: false, source_url: undefined }));
}

/** 依据已有证据生成 FAQ；未知信息必须明确写「官方暂未公布」 */
export function generateFaq(p: AirdropProject): FaqItem[] {
  const unknown = '官方暂未公布。';
  const statusLabel: Record<string, string> = {
    new: '刚被发现，尚未确认',
    potential: '潜在空投，尚未正式确认',
    confirmed: '已确认空投',
    claim_live: '已开放领取',
    ended: '已结束',
  };

  return [
    {
      q: '这个空投确认了吗？',
      a: `当前状态：${statusLabel[p.status] ?? '未知'}。${p.status === 'confirmed' || p.status === 'claim_live' ? '官方渠道已有明确信号。' : '尚未发现官方明确确认，请谨慎参与。'}`,
    },
    {
      q: '什么时候结束？',
      a: p.meta?.airdrop_status ?? unknown,
    },
    {
      q: '参与需要花钱吗？',
      a:
        p.cost.capital_max_usd === 0 && p.cost.gas_estimate_usd === 0
          ? '预计无需资金成本，仅需时间。'
          : `预计资金成本 $${p.cost.capital_min_usd}–${p.cost.capital_max_usd}，Gas 约 $${p.cost.gas_estimate_usd}。`,
    },
    {
      q: '需要连接钱包吗？',
      a: p.guide.some((g) => g.needs_wallet) ? '需要。请务必使用独立的空投钱包。' : '根据目前信息暂不需要。',
    },
    {
      q: '需要主网资产吗？',
      a: p.cost.capital_max_usd > 0 ? '需要少量主网资产用于支付 Gas。' : '暂不需要主网资产。',
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
  return { ...p, guide, guide_source: source, cost: buildCost(p, guide) };
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
  const minutes = guide.reduce((s, g) => s + g.minutes, 0);
  const gas = p.cost.gas_estimate_usd || 0;
  const longTerm = guide.some((g) => /后续持续维护/.test(g.title));
  const capitalMin = p.cost.capital_min_usd ?? 0;
  const capitalMax = Math.max(p.cost.capital_max_usd ?? 0, capitalMin);
  let summary: string;
  if (capitalMax === 0 && gas === 0) {
    summary = '低成本、纯时间投入型项目，适合新手练手。';
  } else if (capitalMax <= 20) {
    summary = '低资金、中时间投入型项目，建议小额参与。';
  } else if (capitalMax <= 100) {
    summary = '中等资金投入，需评估自身风险承受能力。';
  } else {
    summary = '高资金投入，不适合新手大额参与。';
  }
  return {
    capital_min_usd: capitalMin,
    capital_max_usd: capitalMax,
    gas_estimate_usd: gas,
    time_minutes: minutes,
    long_term: longTerm,
    summary,
  };
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
  };
  return [safety, ...steps.map((s, i) => ({ ...s, step: i + 2 }))];
}
