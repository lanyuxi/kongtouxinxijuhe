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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 仓库根目录：用于定位随仓库提交的离线翻译缓存 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 中文判定：只要含汉字即视为中文文案。
 *
 * 不能用「不含 ASCII」这种反向判定：教程里必然出现项目名、代币符号、
 * 网址等英文片段（`连接 MetaMask`），那不代表文案没中文化。
 */
function hasChinese(text: unknown): boolean {
  return /[\u4e00-\u9fa5]/.test(String(text ?? ''));
}

/**
 * 判断一段「仍是英文」的文案，到底是「翻译管线坏了」还是「还没翻」。
 *
 * 为什么需要这个区分（2026-09-18 的线上故障）：
 *   「缺中文」原本一律算发布阻断错误，结果任何**新抓到的英文项目**
 *   都会让 `pipeline` 以 exit 1 结束 —— 而 Airdrops.io 每轮都可能带来新项目。
 *   于是一个项目的英文教程，代价是整站 259 个项目停止更新
 *   （validate 不通过就保留上一版），GitHub Pages 也连带不再发布。
 *
 *   但直接把这条断言删掉又会放过真正的回归：
 *   历史事故里缓存**明明有译文**，`localizeText` 却因改错顺序退回英文原文，
 *   整站 736 条教程静默变成英文，而所有测试仍是绿的。
 *
 * 因此按「缓存里有没有这条」分别处理：
 *   · 缓存命中 → 有译文却没用上 → 真回归 → 报错（保持门禁强度）；
 *   · 缓存未命中 → 新文案还没翻 → 告警 → 放行（不阻断整轮发布）。
 *
 * 缓存文件缺失 / 解析失败时一律按「未命中」处理（宁可告警，不误拦发布）。
 */
function translationMissing(text: unknown): boolean {
  const raw = String(text ?? '').trim();
  if (!raw) return false;
  try {
    // 延迟 require：validate 也被前端构建链路间接引用，避免顶层耦合 i18n 模块
    const cachePath = path.join(ROOT, 'scripts', 'i18n', 'cache.zh.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, string>;
    // 命中且译文含中文 → 说明有译文却没用上，属于回归
    const translated = cache[raw];
    return typeof translated === 'string' && translated.trim() !== '' && hasChinese(translated);
  } catch {
    return false;
  }
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

    // 信任不变量：模板 / 第三方整理的教程不得自称已核实。
    // 模板步骤每轮都会重新生成；第三方步骤来自聚合站编辑、不是官方 HowTo。
    // 两者若放行，前端都会重新出现绿色「✓ 来源已核实」。
    if (p.guide_source === 'template' || p.guide_source === 'third_party') {
      const fake = p.guide.find((g) => g.source_verified);
      if (fake) {
        errors.push(
          `${p.slug}: ${p.guide_source === 'template' ? '模板' : '第三方整理'}教程的步骤 ${fake.step} 谎称「来源已核实」`,
        );
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
        // 与 prune 同口径：弱类目必须叠加「无空投叙事证据」才排除
        status: p.status,
        tagline: p.tagline,
        tasks: p.tasks,
        requirements: p.requirements,
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
    // 只有人工截图才能发现。因此这里对「中文覆盖」做硬性检查。
    //
    // ⚠️ 2026-09-18 修正：**降级为告警，不再阻断发布**。
    //
    //   原先这里是 `errors.push(...)`，即「只要有一步文案没中文就拒绝整轮发布」。
    //   在定时抓取场景下这是个必然踩中的陷阱：
    //     Airdrops.io 每轮都可能带来**全新项目**，而其中文译文只存在于
    //     离线准备的 `scripts/i18n/cache.zh.json`（构建期纯查表、不联网翻译）。
    //     新项目天然不在缓存里 → 门禁必然报错 → `pipeline` 以 exit 1 结束。
    //   实测后果（GitHub Actions + CNB 双侧同一根因）：
    //     · 只要某一轮 Airdrops.io 抓取成功且带回新项目，就整轮失败；
    //       失败率约 1/3（实测 71 轮里 23 轮 error），且随时间推移越来越频繁；
    //     · GitHub 侧失败的直接现象是「构建静态站点」13 秒挂掉，
    //       后面的「发布到 GitHub Pages」被 skip —— 也就是用户收到的
    //       「Some jobs were not successful」邮件；
    //     · 更糟的是它会让**整站数据停止更新**：一个项目的英文教程，
    //       代价是全站 259 个项目都不再发布（validate 不过就保留上一版）。
    //
    //   因此判定标准改为「文案能不能被用户看懂」，而不是「有没有中文」：
    //     · 缺中文 → 告警 + 由前端按既有降级分支展示英文原文并附中文安全提示；
    //     · 这样既不静默，也不会让一条新数据卡死整站发布。
    //   译文补齐仍由 `npm run i18n:cache`（离线）负责，且该缺口会持续告警。
    if (!hasChinese(p.tagline)) {
      // 缓存命中却没中文 = 翻译管线坏了（真回归，必须拦）；
      // 缓存未命中 = 新抓到的英文文案，属于正常缺口（告警，不拦发布）。
      const regressed = translationMissing(p.tagline);
      (regressed ? errors : warnings).push(
        `${p.slug}: 一句话简介缺少中文（当前：${p.tagline.slice(0, 40)}）`,
      );
    }
    for (const g of p.guide) {
      if (!hasChinese(g.title)) {
        const regressed = translationMissing(g.title);
        (regressed ? errors : warnings).push(
          `${p.slug}: 教程步骤 ${g.step} 标题缺少中文（当前：${g.title.slice(0, 40)}）`,
        );
      }
      if (!hasChinese(g.description)) {
        const regressed = translationMissing(g.description);
        (regressed ? errors : warnings).push(`${p.slug}: 教程步骤 ${g.step} 描述缺少中文`);
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
