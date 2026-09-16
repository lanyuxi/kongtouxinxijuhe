/**
 * Glossary：教程中文化所依赖的术语表与人工修正表。
 *
 * 为什么需要这一层（而不是直接把机器翻译结果写进仓库）：
 *   1. 通用翻译引擎会把 Web3 术语按日常语义翻译，产生「铸币美元」（Mint USDe）、
 *      「燃气的 SUI」（SUI for Gas）、「航站楼」（Terminal）这类错译，
 *      直接展示给新手会误导操作；
 *   2. 专有名词（项目名 / 代币符号 / 交易所名）必须原样保留，
 *      否则用户无法在钱包或交易所里对上号；
 *   3. 站点文案要保持统一口径（例如统一用「钱包」「领投」「积分」而不是「推荐/点数」）。
 *
 * 因此术语表分三类：
 *   - TOKEN_TERMS：翻译前后都必须原样出现的专有名词（用占位符保护）；
 *   - TERM_MAP：通用词 → 站内统一译法（翻译后强制替换）；
 *   - HUMAN_FIX：逐条人工修正的错译（键为机器译文，值为正确译法）。
 */

/** 必须在译文中原样保留的专有名词（大小写敏感，按长度倒序替换，避免子串互相破坏） */
export const TOKEN_TERMS = [
  // 代币符号
  '$CTM', '$CARDS', '$AMMORA', '$MNTD', '$FLOP', '$AMA', '$JUP', '$PRIME', '$CARDS',
  'USDe', 'sUSDe', 'sENA', 'USDT', 'USDC', 'USD1', 'USDD', 'ENA', 'ETH', 'SOL', 'BNB',
  'SUI', 'APT', 'JUP', 'INX', 'ARX', 'RTG', 'XDP', 'ASR', 'p8ints', 'HUMA', 'SOSO',
  'SSI', 'rcUSD', 'PC', 'pOmega', 'NFT', 'SBT', 'XP', 'AP', 'CTM', 'WISE', 'TRUMP',
  // 项目 / 产品名
  'AIW3', 'AlloX', 'Amadeus', 'Ammora', 'Arcium', 'Beezie', 'Beldex', 'Blackboard',
  'Brownian', 'C8ntinuum', 'Cambria', 'Collector Crypt', 'DeepBook', 'Doppler',
  'Dow Protocol', 'DropWave', 'Entropy', 'Ethena', 'Flop Labs', 'GRVT', 'Huma',
  'Hyperliquid', 'Infinex', 'Limitless', 'MINT', 'Metamask', 'MetaMask', 'Nado',
  'NeoSoul', 'Nowa', 'o1.exchange', 'Olympus', 'PayBox', 'Perpl', 'Push', 'Reels',
  'Remoji', 'Ritual', 'SoSoValue', 'SoDEX', 'Sweep', 'Sweepbird', 'Tread fi',
  'Tread', 'Vangrid', 'VOICE', 'Wager Predict', 'WheelX', 'Worldie', 'Yakkamon',
  'Galxe', 'Discord', 'Telegram', 'Bybit', 'Binance Alpha', 'Binance', 'Coinbase',
  'Phantom', 'Solflare', 'Backpack', 'Rabby', 'Trust', 'Bybit', 'OKX', 'Kraken',
  'GM', 'Craterun', 'Magma', 'Lambda256', 'AMM', 'LP', 'TVL', 'TGE', 'DAO', 'Gas',
  'MetaMask', 'Layer3', 'Questboard', 'EvoEvo', 'Zealy', 'SoPoints', 'Feathers',
  'Crates', 'Gacha', 'Bonus', 'Wheel', 'Uptime', 'UPTIME', 'Bookie', 'Bookies',
  'Solana', 'Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche',
  'Sui', 'Aptos', 'TON', 'Linea', 'Scroll', 'Blast', 'zkSync', 'Mantle', 'Cosmos',
  'Starknet', 'Sei', 'Berachain', 'Sonic', 'Unichain', 'Ink', 'Ink Sepolia',
  'GIWA Sepolia', 'Sepolia', 'ValueChain', 'HyperEVM', 'BNB Chain', 'Solana',
].sort((a, b) => b.length - a.length);

/**
 * 通用词 → 站内统一译法。
 * 机器翻译常常在同一个词上给出多种译法（推荐 / 邀请 / 介绍），
 * 这里统一口径，避免同一页面出现两套说法。
 */
export const TERM_MAP = [
  // ---- 术语纠错：机器翻译在 Web3 语境下的典型错译 ----
  [/选项卡/g, '标签页'],
  [/小部件/g, '组件'],
  [/燃料/g, 'Gas'],
  [/提取到/g, '提现到'],
  [/领养/g, '领取'],
  [/代币券/g, '凭证'],
  [/礼券/g, '凭证'],
  [/办理登机手续/g, '签到'],
  [/入住/g, '签到'],
  [/登机手续/g, '签到'],
  [/铸币/g, '铸造'],
  [/铸造美元/g, '铸造 USDe'],
  [/正常工作时间/g, '在线时长'],
  [/正常运行时间/g, '在线时长'],
  [/领跑者/g, '排行榜'],
  [/排名榜/g, '排行榜'],
  [/索赔/g, '领取'],
  [/自我保管/g, '自托管'],
  [/自我托管/g, '自托管'],
  [/桥接/g, '跨链'],
  [/加密货币/g, '加密资产'],
  [/数字货币/g, '加密资产'],
  [/电子邮件/g, '邮箱'],
  [/电子邮箱/g, '邮箱'],
  [/网页/g, '页面'],
  [/令牌/g, '代币'],
  [/返利/g, '返佣'],
  [/手机号/g, '手机号'],
  [/推荐链接/g, '邀请链接'],
  [/推荐人/g, '被邀请人'],
  [/推荐好友/g, '邀请好友'],
  [/推荐奖励/g, '邀请奖励'],
  [/积分点数/g, '积分'],
  [/点数/g, '积分'],
  [/钱包地址/g, '钱包地址'],
  [/空投项目/g, '空投项目'],
  [/抵押品/g, '抵押资产'],
  [/质押/g, '质押'],
  [/农场/g, '流动性挖矿'],
  [/铸币/g, '铸造'],
  [/铸币美元/g, '铸造 USDe'],
  [/领取资格/g, '领取资格'],
  [/智能合约/g, '智能合约'],
  [/应用程序/g, '应用'],
  [/点击/g, '点击'],
  [/单击/g, '点击'],
  [/着陆页/g, '落地页'],
  [/投资组合/g, '投资组合'],
  [/控制面板/g, '仪表盘'],
  [/仪表板/g, '仪表盘'],
  [/注册表/g, '注册'],
  [/候补名单/g, '等候名单'],
  [/等候名单/g, '等候名单'],
  [/队列/g, '排队'],
  [/领取窗口/g, '领取时间窗口'],
  [/索赔/g, '领取'],
  [/声明门户/g, '领取入口'],
  [/燃气的/g, 'Gas 用的'],
  [/航站楼/g, '交易终端'],
  [/正常运行时间/g, '在线时长'],
  [/返回/g, '返回'],
  [/页面/g, '页面'],
  [/测试网点/g, '测试网积分'],
  [/测试网络/g, '测试网'],
  [/第1季/g, '第 1 季'],
  [/第2季/g, '第 2 季'],
  [/第3季/g, '第 3 季'],
];

/**
 * 人工修正：机器译文 → 正确译法。
 * 只登记「会影响用户操作判断」的错译，不做无意义润色。
 */
export const HUMAN_FIX = {
  '确认您是否具备资格？': '查看你是否符合资格',
  '连接您的账户': '绑定你的 X 账号',
  '您的钱包': '绑定你的钱包',
  '在X Daily上发布有关Beldex的帖子': '每天在 X 上发布关于 Beldex 的内容',
  '每天办理登机手续并转动转盘': '每天签到并转动幸运转盘',
  '每日入住': '每日签到',
  '完成每日入住': '完成每日签到',
  '每周入住一次': '每周签到一次',
  '清除发布周奖金': '完成上线周任务领取奖励',
  '清除社区任务': '完成社区任务',
  '验证合作伙伴放弃的NFT所有权': '验证合作方空投的 NFT 持有资格',
  '引导交易者向上移动队列': '邀请交易者助力排名上升',
  '连接到熵市场': '连接 Entropy 市场',
  '交易实时熵市场': '在 Entropy 实时市场交易',
  '在熵市场上建立销量': '在 Entropy 市场累计交易量',
  '用于sENA的质押和锁定ENA': '质押并锁定 ENA 以获得 sENA',
  '质押USDe for sUSDe': '质押 USDe 获得 sUSDe',
  '使用您的电子邮箱注册以获得正常运行时间': '用邮箱注册 UPTIME',
  '跟踪机器正常运行时间': '跟踪设备在线时长',
  '从航站楼内邀请交易员': '在交易终端内邀请交易者',
  '关联持有积分的钱包': '连接持有积分的钱包',
  '使用Gas为基地地址充值': '为 Base 地址准备 Gas',
  '在X上关注@ AmmoraHQ': '在 X 上关注 @AmmoraHQ',
  '确认您有燃气的SUI': '确认钱包里有 SUI 作为 Gas',
  '访问DeepBook声明门户': '进入 DeepBook 领取入口',
  '查看并提交您的索赔申请': '核对并提交领取申请',
  '创建您的坎布里亚账户': '创建 Cambria 账号',
  '领取您的旧版p8ints': '领取你的历史 p8ints',
  '实现资金回收': '开启资金恢复',
  '转到Brownian应用程序即可开始使用。': '打开 Brownian 应用即可开始。',
  '确认您的账号资格': '完成账号资格校验',
  '跟踪任务XP和推荐XP': '跟踪任务 XP 与邀请 XP',
};

/**
 * 人称统一：全站面向的是「你」，不是「您」。
 *
 * 为什么必须统一：教程是给新手照着做的，
 * 「您」在中文里带有客服腔，且机器翻译会在同一段里混用，
 * 同一屏出现两种称呼会显得粗糙。
 */
export function unifyPerson(text) {
  return String(text ?? '').replace(/您/g, '你');
}

/**
 * 专有名词周边的空格规整。
 *
 * 机器翻译会产出 `$ CTM`、`__T0__` 这类断裂写法，
 * 中文夹英文时不空格会黏在一起（`持有$CTM`），空格过多又会显得松散。
 * 这里统一成「中英之间一个空格、货币符号紧跟符号」。
 */
export function normalizeSpacing(text) {
  let out = String(text ?? '');
  out = out.replace(/\$\s+([A-Za-z0-9])/g, '$$$1');
  out = out.replace(/@\s+([A-Za-z0-9])/g, '@$1');
  out = out.replace(/([\u4e00-\u9fa5])([A-Za-z0-9$@])/g, '$1 $2');
  out = out.replace(/([A-Za-z0-9%$])([\u4e00-\u9fa5])/g, '$1 $2');
  out = out.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  out = out.replace(/\s{2,}/g, ' ');
  out = out.replace(/\s+([，。、；：！？）])/g, '$1');
  out = out.replace(/([（])\s+/g, '$1');
  return out.trim();
}

/** 步骤标题的「标题化」收尾：去掉机器翻译残留的标点噪音 */
export function polishTitle(title) {
  let t = title.trim();
  t = t.replace(/^[“"'「]+|[”"'」]+$/g, '');
  t = t.replace(/[：:。，,；;！!?？]+$/g, '');
  t = t.replace(/\s+/g, ' ');
  return t;
}
