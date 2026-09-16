/**
 * 骗局识别与域名自查。
 *
 * 为什么需要它（第一性原理）：
 *   系统里已经有 `critical` 一票否决逻辑（索取助记词 / 私钥即判极高风险），
 *   但用户**从来不知道这个判定是怎么来的、长什么样**。
 *   只在结果上打「极高风险」的红标，对没被骗过的人是无效信息 ——
 *   他不知道该防什么，下次仍会中招。
 *
 *   竞品（RugCheck、Scam Sniffer、Wallet Guard、空投猎人）的共同做法是：
 *   先教会用户识别骗局长什么样，再谈机会。这一步纯前端、零成本、
 *   不产生任何外部请求，却是新手留存与资产安全收益最高的一块。
 *
 * 本文件承担两件事，都是**纯函数**，便于单测与复用：
 *   1. 维护「一种骗局一屏图鉴」的静态数据结构（SCAM_TYPES）；
 *   2. 提供域名 / 地址自查：把用户粘贴的链接与官方域名做比对，
 *      给出「疑似仿冒 / 疑似钓鱼 / 无法确认」的可解释结论。
 *
 * ⚠️ 自查的定位必须诚实：
 *   它只能判断「是不是已知官方域名」，**不能证明一个陌生链接是安全的**。
 *   因此结论里永远保留「不在本库中 ≠ 安全」这句话，绝不给出「安全」这种保证性结论。
 */

/** 官方域名清单：hostname（去掉 www.）→ 归属项目名。由 frontend 从 airdrops.json 构建 */
export type OfficialDomainMap = Record<string, string>;

/**
 * 从项目官网 URL 提取可比较的主机名。
 *
 * 只接受「看起来像主机名」的输入：必须含点、且只由字母数字、点和连字符组成。
 * 为什么不能让 URL 解析器直接兜底：`new URL('https://这不是网址')`
 * 不会抛错，而是返回 punycode 主机名 `xn--…`，于是「随手输入的乱码」
 * 会被当成一个真实域名，自查结论就会变得莫名其妙。
 */
export function hostOf(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  let host = '';
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return '';
  }
  host = host.toLowerCase().replace(/^www\./, '');
  if (!host || !host.includes('.')) return '';
  // 只允许正常主机名字符；出现其它字符说明输入根本不是域名
  if (!/^[a-z0-9.-]+$/.test(host.replace(/^xn--[a-z0-9-]+$/, 'punycode-host'))) return '';
  return host;
}

/**
 * 从一批项目官网构建「官方域名 → 项目名」映射。
 * 同一域名可能对应多个项目（如 aave.com 的 V3 / V4），保留第一个名字即可。
 */
export function buildOfficialDomains(
  projects: { slug: string; name: string; official?: { website?: string } }[],
): OfficialDomainMap {
  const map: OfficialDomainMap = {};
  for (const p of projects) {
    const w = p.official?.website;
    if (!w) continue;
    const host = hostOf(w);
    if (!host) continue;
    // 非空投条目（交易所 / 跨链桥 / 质押衍生品）不得进入官方域名库。
    // 为什么必须挡在这里：本表是「防骗自查」的比对基准。
    // 若把 binance.com 这类交易所域名当成「本库已知官方域名」，
    // 用户拿真域名来比对会被判「无法确认」，反而制造出「真假难辨」的错觉；
    // 而这类条目本来就不该出现在空投库里（P0-1 数据治理同步处理）。
    if (isNonAirdropName(p.name)) continue;
    if (!map[host]) map[host] = p.name;
  }
  return map;
}

/** 与 scripts/lib/non-airdrop.ts 保持同一份规则的轻量镜像（前端不能 import scripts/） */
const NON_AIRDROP_NAME_PATTERNS: RegExp[] = [
  /\bcex\b/i,
  /\bdex\s?cex\b/i,
  /\bwrapped\b/i,
  /\bstaked?\b/i,
  /\bliquid\b/i,
  /\blst\b|\blrt\b/i,
  /\bpooled\b/i,
  /\bindex\b/i,
  /\bvault\b/i,
  /\bbridge\b/i,
  /\bderivatives?\b/i,
  /\bbinance\b|\bcoinbase\b|\bokx\b|\bbybit\b|\bbitfinex\b|\bkraken\b|\bkorbit\b|\bindodax\b|\bgate\b|\bhtx\b|\bhuobi\b|\bkucoin\b/i,
  /\bgemini\b|\bmexc\b|\brobinhood\b|\bbitget\b|\bbitstamp\b|\bbitvavo\b|\bbitkub\b|\bbitmex\b|\bderibit\b|\bhashkey\b|\bnexo\b|\bpoloniex\b|\bphemex\b/i,
  /\bcrypto\.com\b|\bswissborg\b|\bosl\b|\bweex\b|\bbingx\b/i,
];

export function isNonAirdropName(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  return NON_AIRDROP_NAME_PATTERNS.some((re) => re.test(n));
}

/**
 * 可取注册域（粗略）：取最后两段，例如 app.uniswap.org → uniswap.org。
 * 对 .co.uk / .com.cn 这类双段后缀做特判，避免把 co.uk 当成注册域。
 */
const TWO_PART_TLDS = ['co.uk', 'com.cn', 'com.hk', 'co.jp', 'org.uk', 'net.cn'];

export function registrableDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/** Levenshtein 距离（用于识别「差一个字母」的仿冒域名） */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

export type CheckVerdict = 'official' | 'lookalike' | 'phishing_signal' | 'unknown' | 'invalid';

export interface CheckResult {
  verdict: CheckVerdict;
  /** 一句话中文结论，直接展示 */
  summary: string;
  /** 具体解释（为什么得出这个结论） */
  detail: string;
  /** 命中的官方域名（若有） */
  matched?: string;
  /** 命中的官方项目名 */
  matchedProject?: string;
  /** 是否看起来像钱包地址而不是网址 */
  isAddress: boolean;
}

/** 常见钓鱼特征子串（不依赖外部接口，纯本地判断） */
const PHISHING_SIGNALS: { re: RegExp; label: string }[] = [
  { re: /(^|[^a-z])(claim|airdrop|reward|bonus|free)/i, label: '域名里带 claim / airdrop / reward / free 这类诱导词' },
  { re: /-{2,}|\.(top|xyz|click|icu|buzz|rest|monster|cfd)$/i, label: '使用了仿冒站点高发的廉价后缀或异常连字符' },
  { re: /^xn--/i, label: '域名使用 Punycode 编码，可能在视觉上伪装成别的品牌' },
  { re: /\d{3,}/, label: '域名中夹带长串数字，常见于批量注册的假站' },
];

/** EVM 地址 / Solana 地址的粗判（仅用于提示「这是地址不是网址」） */
export function looksLikeAddress(input: string): boolean {
  const s = input.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * 对用户粘贴的链接 / 地址做自查。
 *
 * 判断顺序（从确定到不确定）：
 *   1. 非法输入 → invalid
 *   2. 命中已知官方域名（含其子域）→ official
 *   3. 是钱包地址 → unknown（并解释「地址本身无法判断安全，请核对来源」）
 *   4. 与某个官方域名「注册域相同但主机名不同」或「编辑距离很近」→ lookalike（仿冒）
 *   5. 命中钓鱼特征 → phishing_signal
 *   6. 其余 → unknown（明确说明「不在本库中 ≠ 安全」）
 */
export function checkDomain(input: string, official: OfficialDomainMap): CheckResult {
  const raw = input.trim();
  if (!raw) {
    return {
      verdict: 'invalid',
      summary: '请输入网址或钱包地址。',
      detail: '',
      isAddress: false,
    };
  }

  /**
   * ⚠️ 顺序很关键：必须先判断「是不是钱包地址」，再当作网址解析。
   *    否则 `0x…` 会先被 URL 解析器拒掉，落到「输入无效」分支，
   *    用户就看不到「这是地址，地址无法判断安全，且要求先转账的都是骗局」这条关键提示。
   */
  if (looksLikeAddress(raw)) {
    return {
      verdict: 'unknown',
      summary: '这看起来是一个钱包地址，不是网址。',
      detail:
        '地址本身无法判断「安全或不安全」。请核对它是否来自项目官方公告，并注意：任何要求你向某个地址「先转账才能领取」的空投都是骗局。',
      isAddress: true,
    };
  }

  const isAddress = false;
  const host = hostOf(raw);

  if (!host) {
    return {
      verdict: 'invalid',
      summary: '无法解析为网址，请检查是否输入完整（例如 https://app.uniswap.org）。',
      detail: '',
      isAddress,
    };
  }

  // 2) 已知官方域名：命中自身或其子域都算官方
  if (official[host]) {
    return {
      verdict: 'official',
      summary: `域名与已知官方域名一致：${host}`,
      detail: `本库中 ${official[host]} 的官方站点为 ${host}。仍请确认你从正确入口进入，并在签名前核对操作内容。`,
      matched: host,
      matchedProject: official[host],
      isAddress,
    };
  }
  for (const [known, name] of Object.entries(official)) {
    if (host.endsWith(`.${known}`)) {
      return {
        verdict: 'official',
        summary: `该域名是已知官方域名 ${known} 的子域名。`,
        detail: `本库中 ${name} 的官方站点为 ${known}。子域名可能是官方活动页，也可能被第三方冒用，请以官方入口公布的链接为准。`,
        matched: known,
        matchedProject: name,
        isAddress,
      };
    }
  }

  // 3) 仿冒检测：注册域相同但主机名不同，或编辑距离很近
  const reg = registrableDomain(host);
  for (const [known, name] of Object.entries(official)) {
    const knownReg = registrableDomain(known);
    if (reg === knownReg && host !== known) {
      return {
        verdict: 'lookalike',
        summary: `高度可疑：该域名与官方域名 ${known} 使用同一个主域，但主机名不同。`,
        detail: `本库中 ${name} 的官方域名是 ${known}。请直接从官方渠道进入，不要使用搜索引擎广告位或私信里的链接。`,
        matched: known,
        matchedProject: name,
        isAddress,
      };
    }
    // 名字部分差 1–2 个字符（如 uniswap → unisvvap）视为仿冒
    const knownName = knownReg.split('.')[0];
    const namePart = reg.split('.')[0];
    if (knownName.length >= 4 && namePart.length >= 4 && namePart !== knownName) {
      const d = levenshtein(namePart, knownName);
      if (d > 0 && d <= 2) {
        return {
          verdict: 'lookalike',
          summary: `高度可疑：该域名与官方域名 ${known} 仅相差 ${d} 个字符，很像仿冒站点。`,
          detail: `本库中 ${name} 的官方域名是 ${known}。仿冒站常见手法就是改一个字母或把 l 换成 1、rn 换成 m。请勿连接钱包。`,
          matched: known,
          matchedProject: name,
          isAddress,
        };
      }
    }
  }

  // 4) 钓鱼特征
  const hits = PHISHING_SIGNALS.filter((s) => s.re.test(host)).map((s) => s.label);
  if (hits.length > 0) {
    return {
      verdict: 'phishing_signal',
      summary: '可疑：该域名带有常见的钓鱼特征。',
      detail: `${hits.join('；')}。这类域名大量用于假「领取」页面，请勿连接钱包或签名。`,
      isAddress,
    };
  }

  // 5) 未知
  return {
    verdict: 'unknown',
    summary: `本库中没有收录 ${host}。`,
    detail:
      '不在本库中不等于安全，也不等于一定是假站。请自行核对：域名是否为项目官方公告中给出的地址、是否为官方 X 主页简介里的链接。若无法确认，就不要连接钱包。',
    isAddress,
  };
}

/** 骗局图鉴：一种骗局一屏 */
export interface ScamType {
  id: string;
  /** 骗局名称 */
  title: string;
  /** 常见形式（一句话说清它长什么样） */
  appearance: string;
  /** 骗子想要什么 */
  intent: string;
  /** 识破要点 */
  clues: string[];
  /** 中招了怎么办 */
  aftermath: string;
}

export const SCAM_TYPES: ScamType[] = [
  {
    id: 'fake-site',
    title: '假官网（差一个字母）',
    appearance:
      '域名与真官网极像，比如把 uniswap 写成 unisvvap、把 l 换成 1、把 rn 换成 m，或在真域名后面加 -claim、-airdrop。',
    intent: '让你在假页面连接钱包并签名，从而转走你的资产或授权无限额度。',
    clues: [
      '域名拼写有细微异常（多一个字母、少一个字母、字母被数字替换）。',
      '搜索引擎结果上方的「广告」位，往往就是这类假站。',
      '页面做得和真站一样，但网址栏不是你熟悉的官方域名。',
    ],
    aftermath:
      '立刻在 revoke.cash 撤销该网站相关的全部授权，并把钱包剩余资产转移到新钱包；若已泄露助记词，必须放弃该钱包。',
  },
  {
    id: 'fake-support',
    title: '假官方客服私信',
    appearance:
      '在 X（推特）、Telegram、Discord 里主动私信你，头像和名字冒用官方，声称「你的空投领取失败，需要协助」。',
    intent: '把你引到钓鱼网站，或以「验证钱包」为由骗取助记词、私钥。',
    clues: [
      '真正的官方永远不会主动私信你，也不会私聊索要助记词。',
      '账号名常带多余下划线、数字，或关注数极低。',
      '催你「限时领取」「名额即将失效」制造紧迫感。',
    ],
    aftermath: '不要回复、不要点链接，直接拉黑并向平台举报；已在链接里签过名的按上面第①条撤销授权。',
  },
  {
    id: 'fake-claim-sign',
    title: '假「领取」签名弹窗',
    appearance:
      '页面提示「点击确认即可领取空投」，但钱包弹出的签名内容是授权（Approve）或 Permint 无限额度，而不是领取。',
    intent: '拿到你的代币授权，之后随时转走你钱包里对应的资产。',
    clues: [
      '钱包弹窗里写的是 Approve / Set Approval For All，而不是 Claim。',
      '金额一栏是「无限（Unlimited / Max）」而不是具体数量。',
      '领取本该只花一笔 Gas，却要求你先转账、先授权一大笔额度。',
    ],
    aftermath:
      '立即拒绝签名；若已签名，马上到 revoke.cash 撤销该合约授权，并清空该钱包的高价值资产。',
  },
  {
    id: 'fake-airdrop-contract',
    title: '假空投合约授权',
    appearance:
      '伪装成「领取合约」，实际调用 setApprovalForAll 或恶意 transferFrom，诱导你为「互动」而签署合约权限。',
    intent: '获得你全部同类资产（如全部 NFT、全部某个代币）的处置权。',
    clues: [
      '合约地址无法在区块浏览器里对应到项目官方公布的地址。',
      '签名内容是「授权全部」而不是一次具体转账。',
      '项目方从未公布过该合约，只在第三方私信或群里流传。',
    ],
    aftermath: '不要交互；已交互的话立刻撤销 setApprovalForAll 授权，并转移相关资产。',
  },
  {
    id: 'advance-fee',
    title: '先付费才能领取',
    appearance: '页面或客服告诉你，要先支付「解锁费 / 税费 / Gas 押金」才能领取空投。',
    intent: '直接骗取你先转出的那一笔钱，转出后不会有任何空投。',
    clues: [
      '真正的空投**永远不会**要求你先转账才能领取。',
      '领取只需要付你自己的链上 Gas，且 Gas 是给网络的，不是给项目方的。',
      '要求你转到某个个人地址，或让你走站外支付。',
    ],
    aftermath: '这是最纯粹的诈骗，钱基本无法追回。立即停止转账并保留证据报警。',
  },
  {
    id: 'mnemonic-phish',
    title: '索取助记词 / 私钥',
    appearance:
      '无论包装成「钱包校验」「资产恢复」「空投同步」，只要页面让你输入助记词、私钥或 Keystore 文件，就是骗局。',
    intent: '拿到助记词等于拿到你钱包的完全控制权，可以转走全部资产。',
    clues: [
      '助记词 / 私钥一旦输入任何网页，就等于把钱包送人。',
      '真正的钱包操作只需要你在钱包 App 里确认，不需要把助记词告诉网站。',
      '这类页面常伴随「安全检测」「异常登录」等话术制造恐慌。',
    ],
    aftermath:
      '一旦输入过，该钱包立即作废：马上创建新钱包，把还没被转走的资产转到新地址，并停止使用旧钱包。',
  },
];
