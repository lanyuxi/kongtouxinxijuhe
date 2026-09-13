/**
 * 风险等级的「人话翻译」：这意味着什么 + 你应该怎么办。
 *
 * 为什么需要它（第一性原理）：
 *   现在详情页对风险只给一个红字「高」。对已经懂链上操作的人是够的，
 *   但本项目面向新手 —— 新手看到「高」并不知道**高在哪里**，
 *   更不知道**下一步该做什么**。只给等级而不给动作，等于把判断成本又丢回给用户。
 *
 *   竞品（RugCheck / Wallet Guard）的做法是：先说清「这意味着什么」，
 *   再给「现在就去做什么」。这两句话才是新手真正需要的东西。
 *
 * 设计约束：
 *   1. **确定性映射**，不调用任何模型、不产生外部请求（保持零服务端）；
 *   2. 文案只描述**已经发生的客观事实**，不做收益预测、不给「安全」保证；
 *   3. 不同等级之间不能只是措辞强弱，必须给出**不同的下一步动作** ——
 *      否则这层翻译就退化成了同义改写，用户依然拿不到可执行信息。
 */

import type { RiskLevel } from './types';

export interface RiskExplain {
  /** 一句话：这个等级意味着什么（客观描述，不夸大） */
  means: string;
  /** 一句话：现在就应该怎么做（可执行动作） */
  action: string;
  /** 是否属于「需要立即停下来」的等级 */
  urgent: boolean;
}

export const RISK_EXPLAIN: Record<RiskLevel, RiskExplain> = {
  low: {
    means: '目前只需要连接钱包或完成社交任务，没有发现要求转出资产的动作。',
    action: '正常参与即可，但仍然只用空投小号钱包，不要用存有资产的主钱包。',
    urgent: false,
  },
  medium: {
    means: '过程中会出现签名或链上交易，签名一旦发出就无法撤销。',
    action: '每次签名前先读弹窗内容：确认是「领取」而不是「授权无限额度」，看不懂就不要签。',
    urgent: false,
  },
  high: {
    means: '存在授权或资产转入的动作，钱包里的资产有可能被划走。',
    action: '先确认授权额度（不要点「最大额度」），只用小额钱包参与；做完立刻到 revoke.cash 撤销授权。',
    urgent: true,
  },
  critical: {
    means: '检测到索取助记词 / 私钥 / Keystore，或要求向个人地址转账等一票否决行为。',
    action: '立即停止参与，不要连接钱包、不要签名；如果已经输入过助记词，请马上把资产转移到一个全新的钱包。',
    urgent: true,
  },
};

/** 便捷读取：任何输入都能拿到说明（未知等级按 medium 兜底，宁可保守） */
export function riskExplain(level: RiskLevel | undefined): RiskExplain {
  return RISK_EXPLAIN[level ?? 'medium'] ?? RISK_EXPLAIN.medium;
}

/**
 * 单条风险项 → 「这意味着 / 怎么办」。
 *
 * 数据里的 `risks[]` 是数据流水线生成的风险条目（中英混排、来源多样），
 * 因此这里不做语义改写（改写必然出错），而是**按关键词归类到对应的动作建议**，
 * 命中不了就回退到该等级的通用建议。宁可保守，也不编造具体结论。
 */
/**
 * 负向句式的排除规则。
 *
 * 数据里的 risks[] 有一部分本身就是**提醒**，例如
 * 「任何要求输入助记词、私钥或恢复短语的页面都不可信」。
 * 若直接命中「助记词」关键词，就会被翻译成「出现了索取助记词行为」——
 * 原文说的是「别信」，译文说成「已发生」，两者直接矛盾。
 * 这类句子必须以否定语境优先排除。
 */
const NEGATIVE_ADVICE = /任何要求|切勿|请勿|不要|不可信|谨防|警惕|avoid|never|do not|don't/i;

const RISK_KEYWORD_RULES: { re: RegExp; means: string; action: string }[] = [
  {
    re: /签名|sign|permit|授权|approve/i,
    means: '该活动需要你签署链上授权，授权可能包含额度信息。',
    action: '签名前逐项核对内容，不要授予无限额度；活动结束后到 revoke.cash 撤销。',
  },
  {
    re: /助记词|私钥|mnemonic|private\s?key|keystore|seed\s?phrase/i,
    means: '出现了索取助记词 / 私钥这类一票否决行为。',
    action: '无论对方如何解释，一律不提供；已经提供过的，立刻把资产转到新钱包。',
  },
  {
    re: /转账|充值|付费|先付|deposit\s+(fee|money)|pay|payment/i,
    means: '该活动要求你先付出资金。',
    action: '正规空投不会要求「先转账才能领取」，遇到即视为骗局直接退出。',
  },
  {
    re: /测试网|testnet|devnet|水龙头|faucet/i,
    means: '需要在测试网做交互，测试网本身不涉及真实资产。',
    action: '只从官方水龙头领取测试币，不要为了「买测试币」向任何人转账。',
  },
  {
    re: /流动性|liquidity|锁仓|stake|质押/i,
    means: '需要把资产放进协议里，存在价格波动与合约风险。',
    action: '只用你能承受损失的小额资金，并留意赎回条件与锁定期。',
  },
  {
    re: /社交|twitter|x\s*账号|discord|telegram|私信/i,
    means: '涉及社交账号操作，社交平台上的「官方客服」大多是假冒。',
    action: '只通过项目官网公布的账号进入，任何主动私信你的「官方人员」都是骗子。',
  },
  {
    re: /域名|网址|官网|website|钓鱼|phish/i,
    means: '官方入口存在被仿冒的风险，假站点与真站点往往只差一个字母。',
    action: '从本站「官方资料」区块进入，或先在「防骗自查」页粘贴网址比对域名。',
  },
  {
    re: /过期|已结束|截止|ended|expired/i,
    means: '活动可能已经结束或临近截止。',
    action: '先确认官方公告的时间，过期活动不必再投入时间。',
  },
];

export function explainRiskItem(text: string, level: RiskLevel): RiskExplain {
  const base = riskExplain(level);

  /**
   * 负向提醒（「不要用主钱包」「任何要求助记词的都不可信」）不做改写：
   * 原文本身已经是完整建议，任何再解释都可能把「别信」翻成「已发生」。
   * 此时保留原句作为「这意味着」，并把「怎么办」交给该等级的通用动作。
   */
  if (NEGATIVE_ADVICE.test(text)) {
    return { means: text, action: base.action, urgent: base.urgent };
  }

  for (const rule of RISK_KEYWORD_RULES) {
    if (rule.re.test(text)) {
      return { means: rule.means, action: rule.action, urgent: base.urgent };
    }
  }

  /**
   * 命中不了具体规则时，**绝不能把原文回显成「这意味着」** ——
   * 「这意味着：请勿使用主钱包参与实验性项目」这种重复毫无信息量，
   * 只是把同一句话印两遍。此时改为给出该等级本身的含义。
   */
  return { means: base.means, action: base.action, urgent: base.urgent };
}
