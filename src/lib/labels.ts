/**
 * 全站中文化标签映射。
 *
 * 对应方案文档第 30.2 章「强制语言规范」：
 * 除官方专有名称外，所有用户可见 UI 必须使用简体中文。
 */

import type {
  AirdropStatus,
  RiskLevel,
  ValueGrade,
  Category,
  Chain,
} from './types';

export const STATUS_LABEL: Record<AirdropStatus, string> = {
  new: '新发现',
  potential: '潜在空投',
  confirmed: '已确认',
  claim_live: '开放领取',
  ended: '已结束',
};

export const STATUS_STYLE: Record<AirdropStatus, string> = {
  new: 'border-brand/30 bg-brand-wash text-brand',
  potential: 'border-line bg-white text-ink-soft',
  confirmed: 'border-ok/30 bg-ok-wash text-ok',
  claim_live: 'border-warn/30 bg-warn-wash text-warn',
  ended: 'border-line bg-page text-ink-faint',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

export const RISK_STYLE: Record<RiskLevel, string> = {
  low: 'border-ok/30 bg-ok-wash text-ok',
  medium: 'border-warn/30 bg-warn-wash text-warn',
  high: 'border-danger/30 bg-danger-wash text-danger',
  critical: 'border-danger bg-danger text-white',
};

export const GRADE_DESC: Record<ValueGrade, string> = {
  S: '重点参与',
  A: '值得参与',
  B: '可观察',
  C: '优先级较低',
  D: '不建议投入',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  DeFi: 'DeFi',
  L2: 'Layer 2',
  AI: 'AI',
  DePIN: 'DePIN',
  GameFi: 'GameFi',
  Social: '社交',
  Infra: '基础设施',
  NFT: 'NFT',
  Other: '其他',
};

export const CHAIN_LABEL: Record<Chain, string> = {
  Ethereum: '以太坊 Ethereum',
  Solana: 'Solana',
  Base: 'Base',
  Arbitrum: 'Arbitrum',
  Optimism: 'Optimism',
  'BNB Chain': 'BNB Chain',
  Sui: 'Sui',
  Other: '其他公链',
};

export const AUTH_LEVEL = (v: number) =>
  v >= 85 ? '证据充分' : v >= 70 ? '证据较充分' : v >= 50 ? '证据有限' : '证据不足';

export const FRESHNESS_WARN_HOURS = 24;

export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '未知';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  return `${month} 个月前`;
}

export function isStale(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > FRESHNESS_WARN_HOURS * 3600 * 1000;
}

/** 风险等级的原因说明（必须解释「为什么是这个等级」） */
export const RISK_REASON: Record<RiskLevel, string> = {
  low: '当前仅需连接钱包或完成社交任务，未发现资金风险。',
  medium: '涉及签名或交易行为，需要确认每次操作的内容。',
  high: '涉及授权、流动性或资产转入，存在资金损失可能。',
  critical: '检测到索取私钥 / 助记词等高危行为，请立即停止参与。',
};
