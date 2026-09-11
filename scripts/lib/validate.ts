/**
 * Validate：发布前校验。
 *
 * 对应方案文档第 35 章「验收标准」与第 27 章不变量：
 * - 每个「已验证」项目至少存在 2 个可查看来源
 * - Critical Risk 项目不会显示「推荐参与」
 * - 每个评分都有 breakdown
 * - 每一个教程步骤有来源或明确标记「未验证」
 * - 前端源码没有 API Key / Private Key / Secret
 */

import type { AirdropProject } from '../../src/lib/types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProjects(projects: AirdropProject[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (projects.length === 0) {
    errors.push('数据集为空：拒绝发布空数据，避免清空线上内容。');
    return { ok: false, errors, warnings };
  }

  const seen = new Set<string>();
  for (const p of projects) {
    if (seen.has(p.slug)) errors.push(`项目 slug 重复：${p.slug}`);
    seen.add(p.slug);

    if (!p.name) errors.push(`${p.slug}: 缺少项目名称`);
    if (!p.tagline) warnings.push(`${p.slug}: 缺少一句话介绍`);

    // 不变量 1：没有证据的项目不能显示为「已验证」
    const verifiedEvidence = p.evidence.filter((e) => e.verified);
    if (verifiedEvidence.length > 0 && verifiedEvidence.length < 2) {
      warnings.push(`${p.slug}: 已验证证据不足 2 条，不应标记为「已验证」`);
    }

    const independentHosts = new Set(
      verifiedEvidence.map((e) => {
        try {
          return new URL(e.url).hostname;
        } catch {
          return e.url || 'unknown';
        }
      }),
    );
    if (verifiedEvidence.length >= 2 && independentHosts.size < 2) {
      warnings.push(`${p.slug}: 证据来源不独立（同一域名），交叉验证不足`);
    }

    // 不变量 2：评分必须可解释
    if (p.scores.authenticityItems.length === 0)
      errors.push(`${p.slug}: 真实性评分缺少 breakdown`);
    if (p.scores.valueItems.length === 0)
      errors.push(`${p.slug}: 参与价值评分缺少 breakdown`);
    if (p.scores.riskItems.length === 0)
      errors.push(`${p.slug}: 风险评分缺少 breakdown`);

    // 验收标准：Critical Risk 不得推荐参与
    if (p.scores.risk === 'critical' && p.recommendation.action === 'participate') {
      errors.push(`${p.slug}: Critical Risk 项目不得显示「推荐参与」`);
    }

    // 教程来源可追溯
    for (const g of p.guide) {
      const traceable = !!g.source_url || g.source_verified === false;
      if (!traceable) {
        errors.push(`${p.slug}: 教程步骤 ${g.step} 既无来源也未标记未验证`);
      }
    }

    // 成本模型完整性
    if (p.cost.time_minutes <= 0) warnings.push(`${p.slug}: 时间成本为 0`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 扫描前端源码，确保不存在 Secret。
 * 对应不变量 5：浏览器端永远不能出现 API Secret。
 */
export function scanForSecrets(sources: { file: string; content: string }[]): string[] {
  const findings: string[] = [];
  const patterns: { name: string; re: RegExp }[] = [
    { name: 'OpenAI Key', re: /sk-[A-Za-z0-9]{20,}/ },
    { name: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
    { name: 'AWS Key', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Private Key', re: /0x[a-fA-F0-9]{64}/ },
    { name: 'Hardcoded Secret', re: /(api[_-]?key|secret|private[_-]?key)\s*[:=]\s*['"][^'"]{12,}['"]/i },
  ];
  for (const s of sources) {
    for (const p of patterns) {
      if (p.re.test(s.content)) {
        findings.push(`${s.file}: 检测到疑似 ${p.name}`);
      }
    }
  }
  return findings;
}
