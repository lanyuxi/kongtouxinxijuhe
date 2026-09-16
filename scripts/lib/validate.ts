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
import { classifyNonAirdrop } from './non-airdrop';

/**
 * 中文判定：只要含汉字即视为中文文案。
 *
 * 不能用「不含 ASCII」这种反向判定：教程里必然出现项目名、代币符号、
 * 网址等英文片段（`连接 MetaMask`），那不代表文案没中文化。
 */
function hasChinese(text: unknown): boolean {
  return /[\u4e00-\u9fa5]/.test(String(text ?? ''));
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProjects(
  projects: AirdropProject[],
  /**
   * 人工档案登记的 slug。这些项目已被人工核实是真实空投项目，
   * 即便名字命中交易所 / 桥 / 质押衍生品的排除规则也应放行
   * （例如 `Gate`：gate.io 同时是交易所，也是项目池）。
   * 默认空集合 = 不豁免任何条目，保证门禁本身不会静默失效。
   */
  knownProfileSlugs: Set<string> = new Set(),
): ValidationResult {
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
      // 信任不变量：声称「来源已核实」的步骤必须携带可追溯来源链接。
      // 否则就是「有核实标记、无来源证据」的假核实（历史事故：模板步骤
      // 只用官网首页就标 source_verified=true）。
      if (g.source_verified && !g.source_url) {
        errors.push(`${p.slug}: 教程步骤 ${g.step} 标记为已核实但缺少来源链接`);
      }
    }

    // 信任不变量：模板教程（guide_source==='template'）不得自称已核实。
    // 模板步骤每轮都会重新生成，若这里放行，前端会重新出现绿色「✓ 来源已核实」。
    if (p.guide_source === 'template') {
      const fake = p.guide.find((g) => g.source_verified);
      if (fake) {
        errors.push(`${p.slug}: 模板教程的步骤 ${fake.step} 谎称「来源已核实」`);
      }
    }

    // 成本模型完整性
    if (p.cost.time_minutes <= 0) warnings.push(`${p.slug}: 时间成本为 0`);

    // 列表瘦身不变量：详情必须比列表「更全」，否则拆分逻辑出错
    // （例如误把 guide.description 也裁掉，详情页会缺文案但不报错）
    if (!p.guide.some((step) => !!step.description)) {
      warnings.push(`${p.slug}: 教程步骤缺少描述文案`);
    }

    // ---- 非空投条目门禁（P0-1 复核）----
    //
    // 为什么必须放在 validate 而不是只靠 prune：
    //   prune 是**运行时单点**，而且它只在「来源健康」时才跑；
    //   一旦抓取抖动导致 canPrune 为 false，脏数据就会原样落盘，
    //   直到下一轮健康抓取才可能被清掉 —— 中间这段时间它就在线上。
    //   实测（本轮复核）：`validate` 里**没有**这条断言，
    //   审查员当时明确提过，但一直没补上。
    //
    // 规则与抓取侧共用同一份定义（scripts/lib/non-airdrop.ts），
    // 避免「代码里写了规则、库里没应用」的断层。
    // 人工档案登记过的项目豁免（例如 Gate：既是交易所也是项目池）。
    if (!knownProfileSlugs.has(p.slug)) {
      const verdict = classifyNonAirdrop({
        name: p.name,
        categoryText: p.sources?.some((s) => s.name === 'DefiLlama') ? p.category : undefined,
      });
      if (verdict.excluded) {
        errors.push(
          `${p.slug}: 命中非空投规则（${verdict.reason ?? '未知'}），不属于空投项目，不得发布`,
        );
      }
    }

    // ---- 中文覆盖不变量（issue #28）----
    //
    // 站点的用户全部是中文用户，教程与简介必须可读。
    // 历史事故：数据源（Airdrops.io）的 HowTo 是英文，原样落盘后
    // 49 个项目 / 339 步教程整段显示英文，而系统完全不报错 ——
    // 只有人工截图才能发现。因此把「中文覆盖」升级为发布门禁：
    // 缺中文就直接拒绝发布，避免同类问题再次静默上线。
    if (!hasChinese(p.tagline)) {
      errors.push(`${p.slug}: 一句话简介缺少中文（当前：${p.tagline.slice(0, 40)}）`);
    }
    for (const g of p.guide) {
      if (!hasChinese(g.title)) {
        errors.push(`${p.slug}: 教程步骤 ${g.step} 标题缺少中文（当前：${g.title.slice(0, 40)}）`);
      }
      if (!hasChinese(g.description)) {
        errors.push(`${p.slug}: 教程步骤 ${g.step} 描述缺少中文`);
      }
      // 中英对照不变量：译文来自机器翻译时，必须同时保留英文原文，
      // 否则翻译一旦失真，用户没有任何办法核对官方页面的实际文字。
      if (!hasChinese(g.title) || !hasChinese(g.description)) continue;
      if (g.original_title && !g.original_description) {
        warnings.push(`${p.slug}: 教程步骤 ${g.step} 有英文标题但缺少英文描述`);
      }
    }
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
