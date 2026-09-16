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
  // ---- 2026-09-16 独立审查实测暴露的漏项 ----
  // 这些词此前不在表里，被机器翻译按日常语义处理：
  //   $CARDS →「$ 张卡片」、Doppler →「多普勒」、Backpack →「背包」、
  //   ValueChain →「价值链」、Cambria →「坎布里亚郡」、Questboard →「任务板」、
  //   Reels →「卷轴」、Binance →「币安」。
  // 结果就是「用户无法在钱包 / 交易所里对上号」——正是本 PR 要消除的问题。
  'CARDS', 'Raydium', 'Doppler', 'Backpack', 'ValueChain', 'Cambria',
  'Questboard', 'Reels', 'Ritual', 'Solflare', 'Phantom', 'Farcaster',
  'Limitless', 'LMTS', 'MNTD', 'BOOK', 'WP', 'XDP', 'TBook', 'EvoEvo',
  'SoSoValue', 'SoPoints', 'Bookie', 'Bookies', 'Craterun', 'Magma',
  'PayBox', 'Remoji', 'Worldie', 'Yakkamon', 'Vangrid', 'NeoSoul',
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
  /**
   * ⚠️ 键必须是**缓存里的原始机器译文**。
   *
   * 判定依据：applyGlossary 内部第一件事就是 `HUMAN_FIX[传入文本]`，
   * 而它的入参是 cache.zh.json 的原始值 —— 不是「已过术语表」的版本。
   * 因此键必须逐字等于缓存原文，否则永远匹配不上。
   *
   * 历史事故（独立审查 P1-1 实测）：这张表曾有 32 条，
   * 键按另一次生成结果登记，与缓存完全对不上 —— 命中 0 条，
   * 整张表是死代码，错译因此活到了线上，且没有任何报错。
   *
   * 现在由两道防线挡住同类退化：
   *   1. `node scripts/i18n/check-human-fix.mjs --strict`：校验每条键真实命中缓存；
   *   2. `tests/i18n-coverage.test.ts` 断言键命中率 100% 且有效命中 > 0。
   *
   * 维护方式：改完 TERM_MAP 后跑 check-human-fix.mjs，
   * 它会打印仍待人工修正的条目及其可直接粘贴的键值。
   */
  'Access the Rewards Section': '进入奖励页面',
  'At TGE, claim your allocation through the rewards section on mint.io. You can then stake your $MNTD to activate MINT Status, earn compounded staking rewards and start moving up the levels.':
    'TGE 时在 mint.io 的奖励页面领取你的份额，然后质押 $MNTD 激活 MINT 等级，赚取复利质押奖励并开始升级。',
  'Build one on-chain portfolio per day and share your portfolio card on X. This earns guaranteed Gem rewards from the $100,000 pool and stacks with the points you already earn per portfolio.':
    '每天创建一个链上投资组合，并在 X 上分享你的投资组合卡片。这能从 10 万美元奖池中获得保底的 Gems 奖励，并与每个投资组合本身的积分叠加。',
  'Check In Daily and Spin the Wheel': '每天签到并转动幸运转盘',
  'Ranks run across seven tiers, from pilgrim at the bottom to the top 0.5% band. Once your badges are claimed, set the rank emoji on your REP profile and on Telegram, where it acts as the signal other users read before connecting with you.':
    '等级共七层，从最底层的 Pilgrim 到最高的 0.5% 层级。徽章领取后，请在 REP 个人资料和 Telegram 上设置排名表情，其他用户会先看到它再决定是否联系你。',
  'Claim and stake your $MNTD': '领取并质押你的 $MNTD',
  'If you have an allocation, confirm the claim transaction in your wallet. Keep a small amount of SOL on hand to cover the Solana network fee. Your ARX will arrive in the connected wallet once the transaction settles.':
    '如果你有份额，请在钱包中确认领取交易。钱包里保留少量 SOL 用于支付 Solana 网络费用；交易结算后，你的 ARX 会到账到所连接的钱包。',
  'If you traded during Season 3, open the claim portal , connect the wallet you used, and confirm the claim transaction. 3% of the total LMTS supply allocated to platform traders.':
    '如果你在第 3 赛季有过交易，请打开领取入口、连接当时使用的钱包并确认领取交易。$LMTS 总量的 3% 分配给平台交易者。',
  'Open the Referrals tab and click “Activate”. Referrals pay dollar rewards on top of points, and your network’s trading counts toward your Gems.':
    '打开「邀请」标签页并点击「激活」。邀请奖励在积分之外另有现金奖励，你邀请来的用户交易量会计入你的 Gems。',
  'The Season 1 airdrop is confirmed and distributes $125,000 worth of $MNTD to eligible players based on verified platform activity.':
    '第 1 季空投已确认，将根据已验证的平台活动，向符合条件的玩家发放价值 12.5 万美元的 $MNTD。',
  'Enter at least $10 after fees, then approve and confirm. Holding a different token is fine, since the deposit flow swaps into USD1 or U first. Once the phase cap fills, the vault stops taking new money while existing deposits keep running.':
    '扣除手续费后至少存入 $10，然后授权并确认。持有其他代币也可以，存款会先自动换成 USD1 或 U。一旦该阶段额度满了，金库会停止接受新资金，已有存款继续计息。',
  'Enter your deposit amount and confirm the transaction. In return you receive $PST, a liquid LP token that represents your position and accrues Feathers automatically. You can swap $PST back to USDC on Solana venues like Jupiter or Meteora to exit, though unwinding early reduces the Feathers you accumulate.':
    '输入存款金额并确认交易。作为回报你会拿到 $PST —— 代表你份额的流动型 LP 代币，会自动累积 Feathers。想退出时可到 Jupiter、Meteora 等 Solana 平台把 $PST 换回 USDC，但提前取出会减少已累积的 Feathers。',
  'Open Deposit from the Portfolio screen, choose the asset and network, then send funds to the address shown. Picking the wrong network can lose the deposit permanently. Instant and free: USDC on Arbitrum, Polygon, HyperEVM or Solana Routed for a fee shown before you confirm: USDC on Ethereum, Base or BNB Chain Also accepted: USDT credited as USDC, $10 minimum You can buy USDC on Bybit and withdraw straight to Arbitrum , or shift what you already hold onto a supported network with the widget below. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab':
    '在「投资组合」页面点击「存款」，选择资产与网络，然后把资金打到页面显示的地址。选错网络可能永久丢失存款。即时且免费：Arbitrum、Polygon、HyperEVM 或 Solana 上的 USDC；收费路径（确认前会显示费用）：以太坊、Base 或 BNB Chain 上的 USDC；也接受 USDT（按 USDC 计价，最低 $10）。你可以在 Bybit 买入 USDC 后直接提现到 Arbitrum，或用下方组件把已持有的资产转到受支持的网络上。跨链资金：无需离开本页即可在 30 多条链之间兑换与跨链，路径快、费用低。',
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
