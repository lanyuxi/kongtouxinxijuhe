/**
 * 任务摘要：把「分步教程」压缩成一行可读的「操作」说明。
 *
 * 为什么需要它：
 *   参考竞品列表的呈现方式 —— 卡片上不展开完整教程，只给一行
 *   「操作：加入候补名单、关注 X、邀请用户」。
 *   这比罗列 "tasks: ['钱包','社交任务']" 这种内部标签更有指导性，
 *   因为它直接来自真实的操作步骤标题。
 *
 * 数据来源优先级：
 *   1) guide 步骤标题（真实抓取到的 HowTo，最贴近实际操作）
 *   2) tasks 字段（人工/来源标注的任务标签）
 */

import type { AirdropProject } from './types';

/** 从英文步骤标题里提取「动作动词」，转成中文短语 */
const ACTION_MAP: [RegExp, string][] = [
  [/waitlist|sign\s?up|register|create\s+(an\s+)?account|open\s+(an\s+)?account/i, '注册账号'],
  [/join|enter/i, '加入'],
  [/connect|link\s+(your\s+)?wallet|wallet/i, '连接钱包'],
  [/follow|twitter|\bx\b|tweet/i, '关注 X'],
  [/discord/i, '加入 Discord'],
  [/telegram/i, '加入 Telegram'],
  [/invite|refer|share|referral/i, '邀请用户'],
  [/deposit|stake|supply|lend|provide\s+liquidity/i, '存入资产'],
  [/swap|trade|exchange/i, '交易'],
  [/bridge/i, '跨链'],
  [/mint/i, '铸造 NFT'],
  [/claim/i, '领取空投'],
  [/quest|task|mission|complete/i, '完成任务'],
  [/verify|eligib/i, '查看资格'],
  [/testnet|devnet/i, '测试网交互'],
  [/vote|governance/i, '参与治理'],
  [/download|install|app/i, '安装应用'],
  [/watch|video|record/i, '录制视频'],
  [/check[\s-]?in|daily/i, '每日签到'],
  [/game|play/i, '参与游戏'],
];

/** 去掉步骤标题里的序号与装饰词 */
function cleanStepTitle(title: string): string {
  return title
    .replace(/^step\s*\d+\s*[:.\-–]?\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 单个步骤标题 → 中文动作短语 */
function toAction(title: string): string | null {
  const t = cleanStepTitle(title);
  if (!t || t.length > 120) return null;
  for (const [re, label] of ACTION_MAP) {
    if (re.test(t)) return label;
  }
  // 没有命中映射时，不硬凑中文；返回 null 让调用方回退到 tasks
  return null;
}

/**
 * 生成「操作：xxx、yyy」所需的短语数组。
 * 最多 3 条，去重，保持出现顺序。
 */
export function operationSummary(p: AirdropProject, max = 3): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s) && out.length < max) out.push(s);
  };

  // 1) 优先用真实步骤
  for (const step of p.guide) {
    if (p.status !== 'claim_live' && /^参与前安全检查$/.test(step.title)) continue;
    const action = toAction(step.title);
    if (action) push(action);
    if (out.length >= max) break;
  }

  // 2) 中文背景的 tasks 字段（本身就是中文标签，直接可用）
  for (const t of p.tasks) {
    const clean = t.trim();
    if (!clean) continue;
    // 过滤掉「连接钱包」这类过泛且非行动的信息
    push(clean.replace(/^聊天|^社交任务$/, '社交任务'));
    if (out.length >= max) break;
  }

  // 3) 兜底：至少给一条，避免卡片出现空白行
  if (out.length === 0) {
    if (p.status === 'claim_live') push('查看资格，领取空投');
    else if (p.status === 'confirmed') push('完成任务，等待分发');
    else push('研究项目，择机参与');
  }

  return out;
}

/** 用于卡片一行展示的完整文案 */
export function operationLine(p: AirdropProject): string {
  return `操作：${operationSummary(p).join('、')}`;
}
