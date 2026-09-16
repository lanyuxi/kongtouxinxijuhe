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
  '$CTM', '$CARDS', '$AMMORA', '$MNTD', '$FLOP', '$AMA', '$JUP', '$PRIME',
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
  'Phantom', 'Solflare', 'Backpack', 'Rabby', 'Trust',  'OKX', 'Kraken',
  'GM', 'Craterun', 'Magma', 'Lambda256', 'AMM', 'LP', 'TVL', 'TGE', 'DAO', 'Gas',
  'Layer3', 'Questboard', 'EvoEvo', 'Zealy', 'SoPoints', 'Feathers',
  'Crates', 'Gacha', 'Uptime', 'UPTIME', 'Bookie', 'Bookies',
  // 注意：'Bonus' / 'Wheel' 已移除。
  // 它们在教程里几乎只作普通名词（Daily Bonus / Spin the Wheel），
  // 保护后反而会把「每日奖励」变成「每日 Bonus」，属于过度保护。
  // 'Push Chain' 必须比裸词 'Push' 长；否则 'Push' 先替换，只剩 'Chain' 被译成「Push链」。
  'Push Chain', 'Canopy Network', 'Gyndore', 'Hertzflow', 'DualMint',
  'Solana', 'Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche',
  'Sui', 'Aptos', 'TON', 'Linea', 'Scroll', 'Blast', 'zkSync', 'Mantle', 'Cosmos',
  'Starknet', 'Sei', 'Berachain', 'Sonic', 'Unichain', 'Ink', 'Ink Sepolia',
  'GIWA Sepolia', 'Sepolia', 'ValueChain', 'HyperEVM', 'BNB Chain',
  // ---- 2026-09-16 独立审查实测暴露的漏项 ----
  // 这些词此前不在表里，被机器翻译按日常语义处理：
  //   $CARDS →「$ 张卡片」、Doppler →「多普勒」、Backpack →「背包」、
  //   ValueChain →「价值链」、Cambria →「坎布里亚郡」、Questboard →「任务板」、
  //   Reels →「卷轴」、Binance →「币安」。
  // 结果就是「用户无法在钱包 / 交易所里对上号」——正是本 PR 要消除的问题。
  'CARDS', 'Raydium', 'Farcaster',
  'LMTS', 'MNTD', 'BOOK', 'WP', 'TBook',
  // ---- 2026-09-16 P1-5：已中文化但「译得不准」的收口 ----
  // 这一批不是「漏译」而是「错译」，因此旧的「必须含中文」门禁测不出来：
  //   portal →「门户」（36 条，用户找不到页面上的入口按钮）
  //   Feathers →「羽毛」、Gems →「宝石」、Card →「卡牌」、Pilgrim →「朝圣者」
  // 这些词是**项目自有的积分 / 资产 / 等级名**，译掉之后用户在项目页面上
  // 完全对不上号 —— 与「$CARDS 被译成 $ 张卡片」是同一类问题。
  // 保护后它们会以英文原样出现在中文句子里，例如
  // 「打开领取 portal，连接钱包」。
  'Card Packs', 'Gacha Card', 'Pilgrim', 'Gems', 'Gem',
  'Vanguard', 'MINT Status', 'Bird Tier', 'portal',
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
  [/推荐链接/g, '邀请链接'],
  [/推荐人/g, '被邀请人'],
  [/推荐好友/g, '邀请好友'],
  [/推荐奖励/g, '邀请奖励'],
  [/积分点数/g, '积分'],
  [/点数/g, '积分'],
  [/抵押品/g, '抵押资产'],
  [/农场/g, '流动性挖矿'],
  [/铸币美元/g, '铸造 USDe'],
  [/应用程序/g, '应用'],
  [/单击/g, '点击'],
  [/着陆页/g, '落地页'],
  [/控制面板/g, '仪表盘'],
  [/仪表板/g, '仪表盘'],
  [/注册表/g, '注册'],
  [/候补名单/g, '等候名单'],
  [/队列/g, '排队'],
  [/领取窗口/g, '领取时间窗口'],
  [/声明门户/g, '领取入口'],
  [/燃气的/g, 'Gas 用的'],
  [/航站楼/g, '交易终端'],
  [/测试网点/g, '测试网积分'],
  [/测试网络/g, '测试网'],
  [/第1季/g, '第 1 季'],
  [/第2季/g, '第 2 季'],
  [/第3季/g, '第 3 季'],
  // ---- P1-5：机器翻译的通用错译收口 ----
  // 只登记「会让用户误解操作」的词，不做无意义润色。
  [/现在桥/g, '立即跨链'],   // 模板广告句里的 "Bridge now"
  [/打开桥/g, '打开跨链页面'],
  [/桥接基金/g, '跨链资金'],
  [/提款地址/g, '提现地址'],
  [/门户网站/g, '入口页面'],
  [/门户/g, 'portal'],
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
   *
   * ⚠️ 键的形态（P2-4 收口，务必遵守）：
   *   键 = **人工修正前**的机器译文，即 cache.zh.json 里的原始值。
   *   查表发生在 applyGlossary 的第一步（`HUMAN_FIX[text]`，text 是缓存原文），
   *   因此修正值与缓存值**必须不同** —— 一旦有人把修正值反写回缓存，
   *   applyGlossary 会「查得到键但换出来还是同一句话」，
   *   整张表在运行期空转，而所有断言依然是绿的（第二轮审查正是这样被绕过）。
   *   两道护栏锁死这一点：
   *     1. `npm run validate` 会校验「每条键都命中缓存」；
   *     2. `tests/i18n-coverage.test.ts` 断言「修正值 ≠ 缓存值」且端到端生效。
   *
   * ⚠️ 格式约束：修正值里**不能出现两个及以上连续空格**。
   *   空格规整（normalizeSpacing）会把连续空格压成一个，
   *   带上「__」这类占位符记号会被改写 —— 端到端断言会红。
   *   需要用符号分隔时用「·」「＝」「-」等可见字符。
   *
   * ⚠️ 译文里不允许出现「门户」：`portal` 已进入专有名词表，
   *   会在译文里以英文原样保留（用户才能与项目页面上的字样对上号）。
   */
  "Approve the final confirmation in the portal, then save a screenshot of the confirmed address and the transaction hash. That record is what Doppler support will ask for.":
    "在 portal 中批准最终确认，然后保存确认地址和交易哈希的截图。该记录正是 Doppler 客服所要求的。",
  "At TGE, claim your allocation through the rewards section on mint.io. You can then stake your $MNTD to activate MINT Status, earn compounded staking rewards and start moving up the levels.":
    "在 TGE，通过 mint.io 的奖励页面领取你的分配。然后，你可以质押你的 $MNTD 来激活 MINT Status，获得复合质押奖励并开始升级。",
  "Browse open requests at the Vangrid bounty portal. These are location-specific asks from buyers, and selected submissions pay USDC on Base. Browsing requires no invite code.":
    "浏览 Vangrid 赏金 portal 的开放请求。这些是买家针对特定地点提出的要求，选定的提交内容需在 Base 上支付 USDC。浏览不需要邀请码。",
  "Build one on-chain portfolio per day and share your portfolio card on X. This earns guaranteed Gem rewards from the $100,000 pool and stacks with the points you already earn per portfolio.":
    "每天构建一个链上投资组合，并在 X 上分享你的投资组合卡。这将保证从 100,000 美元池中获得 Gem 奖励，并与你每个投资组合已赚取的积分叠加。",
  "Check Your ARX Eligibility":
    "检查你的 ARX 资格",
  "Check the allocation shown in the encrypted portal. A zero balance does not always mean exclusion, as your contributions may still be under review or set for a later RTG wave.":
    "检查加密的 portal 中显示的分配。零余额并不总是意味着被排除，因为你的贡献可能仍在审核中或为稍后的 RTG 轮次。",
  "Claim and stake your $MNTD":
    "领取并质押你的 $MNTD",
  "Click the wallet icon inside the portal to open the faucet and claim 1 free PC token. The faucet resets every 6 hours, so grab it a few times a day to keep enough gas for the onchain quests.":
    "点击 portal 内的钱包图标打开水龙头并领取 1 个免费的 PC 代币。水龙头每 6 小时重置一次，因此每天抓住几次，为链上任务保留足够的 Gas。",
  "Confirm Your Base Receiving Address":
    "确认你的 Base 收货地址",
  "Confirm the reservation and check that the portal shows it as reserved. Gyndore has not announced a fallback for allocations left unreserved after 09.09.26, so treat the date as final.":
    "确认预订并检查 portal 是否显示为已预订。 Gyndore 尚未宣布 2026 年 9 月 9 日之后未保留的分配的回退，因此请将该日期视为最终日期。",
  "Connect Your Wallet to the Wager Predict Testnet":
    "将你的钱包连接到 Wager Predict 测试网",
  "Connect a Solana wallet such as Phantom, Solflare, or Backpack. Approve the connection so the portal can read your contribution history and any allocation tied to your wallet or Discord identity.":
    "连接 Solana 钱包，例如 Phantom、Solflare 或 Backpack。批准连接，以便 portal 可以读取你的贡献历史记录以及与你的钱包或 Discord 身份相关的任何分配。",
  "Connect the same wallet from Step 1 and approve the signature request. The portal reads your DP balance and shows whether the address qualifies.":
    "连接与步骤 1 相同的钱包并批准签名请求。 portal 读取你的 DP 余额并显示该地址是否符合条件。",
  "DualMint has announced UPTIME, a free points campaign whose dashboard states that claims at the close of Epoch 1 are made through a conne...":
    "DualMint 已宣布 UPTIME，这是一项免费积分活动，其仪表盘显示，在第 1 纪元结束时的领取是通过连接...",
  "Enter a Base address you hold the private keys for. Three things will cost you the allocation: Exchange deposit addresses, which cannot receive an airdrop claim Smart contract addresses Addresses on a network Doppler does not support Submissions cannot be edited after confirmation, so read the address back before you sign.":
    "输入你持有私钥的 Base 地址。三件事会花费你的分配： 交易所存款地址，无法接收空投领取智能合约地址网络上的地址 Doppler 不支持提交内容在确认后无法编辑，因此在签名之前请读回地址。",
  "Enter your deposit amount and confirm the transaction. In return you receive $PST, a liquid LP token that represents your position and accrues Feathers automatically. You can swap $PST back to USDC on Solana venues like Jupiter or Meteora to exit, though unwinding early reduces the Feathers you accumulate.":
    "输入你的存款金额并确认交易。作为回报，你会收到 $PST，这是一种流动的 LP 代币，代表你的头寸并自动累积 Feathers。你可以在 Jupiter 或 Meteora 等 Solana 场所将 $PST 兑换回 USDC 退出，不过提前平仓会减少你积累的 Feathers。",
  "Entropy markets settle in USDC held in your Hyperliquid perps balance, funded via Arbitrum. Buy USDC on Bybit and withdraw straight to Arbitrum, or shift existing funds across chains using the widget below. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "Entropy 市场结算在你的 Hyperliquid 永续余额中持有的 USDC，通过 Arbitrum 提供资金。在 Bybit 上购买 USDC 并直接提现到 Arbitrum，或使用下面的组件跨链转移现有资金。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "Follow PushChain on X and join the Push Chain Discord , then complete verification inside the portal. This unlocks the quest board and referral link.":
    "在 X 上关注 PushChain，加入 Push ChainDiscord，然后在 portal 内部完成验证。这将解锁 Questboard 和邀请链接。",
  "Go to the Arcium RTG portal or use the Magna portal and open the eligibility checker.":
    "前往 Arcium RTG portal 或 Magna portal，打开资格检查器。",
  "Go to the DeepBook claims portal . Read and accept the terms of use and privacy policy before moving on.":
    "转到 DeepBook 声明 portal。在继续之前，请阅读并接受使用条款和隐私政策。",
  "Go to the Ethena app and click “Connect Wallet.” Ethena supports MetaMask, WalletConnect, and other major Ethereum wallets. Make sure you are on Ethereum mainnet, since staking happens on the production network.":
    "前往 Ethena 应用程序并点击“连接钱包”。 Ethena 支持 MetaMask、WalletConnect 等主流 Ethereum 钱包。确保你位于 Ethereum 主网上，因为质押发生在生产网络上。",
  "Go to the Gyndore reservation portal . The old DropWave campaign page now redirects here, so any saved bookmark should land in the same place.":
    "前往 Gyndore 预约 portal。旧的 DropWave 活动页面现在重定向至此处，因此任何保存的书签都应放置在同一位置。",
  "Go to the Jupiter governance portal , connect your wallet, and stake. Unstaking has a 30-day cooldown, so treat the position as locked for at least a quarter if you plan to farm consecutive rounds.":
    "前往 Jupiter 治理 portal，连接你的钱包并进行质押。取消质押有 30 天的冷却时间，因此，如果你计划连续进行轮数，请将该仓位锁定至少四分之一。",
  "Go to the LAPTOP claim portal and enter the email tied to your Substack or Channel 5 subscription. It shows your eligibility and allocation before you commit.":
    "转到 LAPTOP 领取 portal 并输入与你的 Substack 或 Channel 5 订阅相关的电子邮件。它会在你提交之前显示你的资格和分配情况。",
  "Go to the Olympus Aptos page . The claim tab sits directly on the dashboard.":
    "进入 OlympusAptos 页面。领取标签页直接位于仪表盘上。",
  "Go to the UPTIME campaign page and enter the email address you want tied to your points. Balances are held on the waitlist server, so the same address works from any device.":
    "前往 UPTIME 活动页面并输入你想要与积分绑定的电子邮件地址。余额保存在候补名单服务器上，因此同一地址可以在任何设备上使用。",
  "Go to the official $XDP Airdrop portal . Doppler links it from its own X account and site, so check the domain before signing anything. Token launch pages attract copycat sites; our safety guide covers the warning signs.":
    "前往官方 $XDP 空投 portal。 Doppler 从它自己的 X 帐户和站点链接它，因此在签署任何内容之前请检查域。代币发布页面吸引模仿网站；我们的安全指南涵盖了警告标志。",
  "Hit the daily check-in whenever you open the portal. Streaks stack a bonus on top of the base reward, and a missed day resets it.":
    "每当你打开 portal 时，请点击每日签到。连续奖励会在基本奖励之上叠加奖励，错过一天则会重置奖励。",
  "Holding is scored per chain, not on a combined balance, so positions on Ethereum, BNB Chain and Solana each earn separately and stack. A chain needs at least 5 CTM before it scores. Buy ETH, BNB or SOL on Bybit , withdraw to your own wallet, then use the widget below to move funds onto the chain you plan to hold on. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "持有是按每条链计分，而不是按总余额计分，因此 Ethereum、BNB Chain 和 Solana 上的仓位各自单独赚取并叠加。一条链至少需要 5 个 CTM 才能得分。在 Bybit 上购买 ETH、BNB 或 SOL，提现到你自己的钱包，然后使用下面的组件将资金转移到你打算持有的链上。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "If you have an allocation, confirm the claim transaction in your wallet. Keep a small amount of SOL on hand to cover the Solana network fee. Your ARX will arrive in the connected wallet once the transaction settles.":
    "如果你有分配，请在你的钱包中确认领取交易。手头保留少量 SOL 以支付 Solana 网络费用。交易结算后，你的 ARX 将到达连接的钱包中。",
  "If you have no allocation yet, submit new contributions through the RTG Directory inside the portal. Work across the Developer, Ecosystem, and Community tracks earns Encrypted Credits that can convert to ARX in a future wave.":
    "如果你还没有分配，请通过 portal 内的 RTG 目录提交新的贡献。跨开发者、生态系统和社区轨道的工作可以获得加密积分，这些积分可以在未来的浪潮中转换为 ARX。",
  "If you hold HUMA, staking it earns additional Feathers on top of your LP rewards, with no fixed lockup. Holding $PST while staking adds a further boost, and keeping tokens staked for six months unlocks Vanguard status. Unstake any time.":
    "如果你持有 HUMA，在 LP 奖励之外，质押它还可以获得额外的 Feathers 奖励，没有固定锁定。在质押时持有 $PST 会进一步提升，将代币质押六个月可解锁 Vanguard 状态。随时取消质押。",
  "If you registered before July 17 and selected a destination, your first tranche is sent automatically. Tokens routed to your GRVT account land immediately at the TGE; external BSC or Ethereum wallets can take up to 30 minutes because of network congestion.":
    "如果你在 7 月 17 日之前注册并选择了目的地，你的第一笔款项将自动发送。发送至你 GRVT 账户的代币将立即到达 TGE；由于网络拥塞，外部 BSC 或 Ethereum 钱包可能需要长达 30 分钟的时间。",
  "If you traded during Season 3, open the claim portal , connect the wallet you used, and confirm the claim transaction. 3% of the total LMTS supply allocated to platform traders.":
    "如果你在第 3 赛季期间进行过交易，请打开领取 portal，连接你使用的钱包，并确认领取交易。 LMTS 总供应量的 3% 分配给平台交易者。",
  "Install a Solana wallet such as Phantom, Solflare, or Backpack. You need SOL for network fees and USDC (or $CARDS) to open Gacha packs. If you don’t have any, buy them on Binance or use the bridge below Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "安装 Solana 钱包，例如 Phantom、Solflare 或 Backpack。你需要 SOL 来支付网络费用，并需要 USDC（或 $CARDS）来打开 Gacha 礼包。如果你没有，请在 Binance 上购买，或使用跨链交换下方的桥，在 30 多个链之间进行跨链，而无需离开此页面。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "Install a Sui wallet first. Slush and Nabox both work across TBook’s products, and you will want a little SUI for gas. Then open the TBook engagement portal , connect the wallet, and link your X account and Discord. The Passport is the container every score writes into, so an incomplete profile caps everything downstream.":
    "先安装一个 Sui 钱包。Slush 和 Nabox 都能在 TBook 的产品上使用，你也需要一点 SUI 来支付 Gas。然后打开 TBook 参与 portal，连接钱包，并关联你的 X 账号和 Discord。Passport 是记录每一个分数的容器，资料不完整会限制后续所有环节。",
  "Later registrants claim through the reward portal instead. Locate your unlocked batch, click Claim, and the $GRVT is credited to your GRVT account once confirmed. If several batches are unlocked, claim each one individually.":
    "后来注册者改为通过奖励 portal 领取。找到你解锁的批次，单击“领取”，确认后 $GRVT 将记入你的 GRVT 帐户。如果解锁了多批，请单独领取每一批。",
  "Lock Your Position for Bonus Feathers":
    "锁定你的位置以获得奖金 Feathers",
  "Mint your WISE Credit Score from the same portal. It reads your linked wallets and accounts and grades you across four dimensions. Mint early, because the score accrues history and a profile built weeks before a snapshot outweighs one created that day.":
    "从相同的 portal 铸造你的 WISE 信用评分。它会读取你链接的钱包和帐户，并从四个维度对你进行评分。尽早创建，因为分数会累积历史记录，并且快照前几周建立的配置文件比当天创建的配置文件更重要。",
  "Monitor your accumulated Sats on the Ethena dashboard during the season. When Season 6 closes, return to the official claim portal, connect the same wallet, and claim your ENA. Keep ETH available for the claim transaction.":
    "在赛季期间，在 Ethena 仪表盘上监控你累积的 Sats。当第 6 季结束时，返回官方领取 portal，连接同一个钱包，并领取你的 ENA。保持 ETH 可用于领取交易。",
  "Once your post clears review, the dashboard generates an invite link. Each verified signup adds Referral XP, and referrals are the only quest that scales past a one-time payout.":
    "一旦你的帖子通过审核，仪表盘就会生成邀请链接。每个通过验证的注册都会累加 Referral XP，而邀请是唯一能突破一次性奖励上限的任务。",
  "Open Deposit from the Portfolio screen, choose the asset and network, then send funds to the address shown. Picking the wrong network can lose the deposit permanently. Instant and free: USDC on Arbitrum, Polygon, HyperEVM or Solana Routed for a fee shown before you confirm: USDC on Ethereum, Base or BNB Chain Also accepted: USDT credited as USDC, $10 minimum You can buy USDC on Bybit and withdraw straight to Arbitrum , or shift what you already hold onto a supported network with the widget below. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "从投资组合页面打开存款，选择资产和网络，然后将资金发送到显示的地址。选择错误的网络可能会永久损失存款。即时且免费：USDC，Arbitrum、Polygon、HyperEVM 或 Solana 在你确认之前按页面显示的费用进行路由：USDC，Ethereum、Base 或 BNB Chain 也接受： USDT 计入 USDC，最低 10 美元你可以在 Bybit 上购买 USDC 并直接提现至 Arbitrum，或者使用下面的组件将你已经持有的内容转移到受支持的网络上。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "Open EvoEvo , create your agent, and bind its ERC-8004 identity on BNB Smart Chain. This registration needs a small amount of BNB for gas. You can buy BNB on Bybit and withdraw it to BNB Chain, or move funds you already hold using the widget below to bridge or swap into BNB. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "打开 EvoEvo，创建你的代理，并将其 ERC-8004 身份绑定到 BNB Smart Chain 上。本次注册需要少量 BNB 用于支付 Gas。你可以在 Bybit 上购买 BNB 并将其提现到 BNB Chain，或者使用下面的组件将你已持有的资金转移到 BNB。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "Open packs through the Gacha Machine using USDC or $CARDS. This is the core activity that builds your points balance. Each pack reveals a tokenized card you can keep, trade, sell back instantly, or redeem for the physical version.":
    "使用 USDC 或 $CARDS 通过 Gacha 机器打开包装。这是建立积分平衡的核心活动。每包都会包含一张代币化的卡片，你可以保留、交易、立即回售或兑换实体版本。",
  "Open positions across the Nado markets to earn points. Points reward genuine market participation rather than raw volume, so trading, posting limit orders as a maker, and supporting liquidations all count. Wash trading and self-matching can reduce or zero out your allocation for that week.":
    "在 Nado 市场上开仓即可赚取积分。积分奖励的是真正的市场参与而不是原始交易量，因此交易、作为挂单者发布限价订单以及支持清算都很重要。清洗交易和自我匹配可以减少或清零你那周的分配。",
  "Open the Deposit section and pick the mode that fits your goal: Classic : Earns real yield (around 10.5% APY, updated monthly) plus a base rate of Feathers. Best if you want returns alongside airdrop points. Maxi : Earns 0% APY but generates up to 5x the Feathers of Classic mode. Best if you are optimizing purely for allocation.":
    "打开存款部分并选择适合你目标的模式： 经典：赚取实际收益率（年利率约 10.5%，每月更新）加上基本利率 Feathers。如果你想要回报和空投积分，这是最好的选择。 Maxi：赚取 0% APY，但产生高达经典模式 5 倍的 Feathers。如果你纯粹针对分配进行优化，则最好。",
  "Open the Dow Protocol points page and connect a wallet. BNB Chain is the primary network for XP tracking. BNB Chain: MetaMask, Rabby or any EVM wallet works for the main dashboard Sui: bind a Sui wallet too if you plan to use the Volo vault":
    "打开 Dow Protocol 积分页面并连接钱包。 BNB Chain 是 XP 跟踪的主要网络。 BNB Chain：MetaMask、Rabby 或任何适用于主仪表盘的 EVM 钱包 Sui：如果你打算使用 Volo 金库，也可以绑定 Sui 钱包",
  "Open the DropWave Reservation Portal":
    "打开 DropWave 预订 portal",
  "Open the GRVT reward portal":
    "开启 GRVT 奖励 portal",
  "Open the Official Claim Portal":
    "打开官方领取 portal",
  "Open the Referrals tab and click “Activate”. Referrals pay dollar rewards on top of points, and your network’s trading counts toward your Gems.":
    "打开推荐标签页并单击“激活”。推荐除了积分之外还会支付美元奖励，你网络的交易也计入你的 Gems。",
  "Open the XDP Genesis Airdrop Portal":
    "打开 $XDP 创世空投 portal",
  "Passive staking earns nothing. Open the active proposals in the governance portal and vote on each one. Jupiter rewards participation rather than accuracy, so voting on the losing side still counts toward your allocation.":
    "被动质押不会带来任何收益。打开治理 portal 中的活跃提案并对每一项进行投票。木星奖励参与而不是准确性，因此失败一方的投票仍然计入你的分配。",
  "Ranks run across seven tiers, from pilgrim at the bottom to the top 0.5% band. Once your badges are claimed, set the rank emoji on your REP profile and on Telegram, where it acts as the signal other users read before connecting with you.":
    "等级分为七个等级，从底层的 Pilgrim 到最高的 0.5% 等级。一旦你的徽章被领取，请在你的 REP 个人资料和 Telegram 上设置排名表情符号，它充当其他用户在与你联系之前阅读的信号。",
  "Set the Base address that should receive bGYND. Use an address you hold the keys to, because exchange deposit addresses often reject tokens they have not listed.":
    "设置应该接收 bGYND 的 Base 地址。使用你持有密钥的地址，因为交易所存款地址通常会拒绝未列出的代币。",
  "Share your referral link from the portal. You earn 16% of the points your invites generate and another 8% from the people they invite. Extra invite slots unlock as your referrals reach level 7, so help your invites stay active.":
    "分享你来自 portal 的邀请链接。你可以从你的邀请中获得 16% 的积分，另外 8% 可以从他们邀请的人那里获得。当你的推荐达到 7 级时，会解锁额外的邀请槽位，因此请帮助你的邀请保持活跃。",
  "Sign in at the GRVT website and go to the reward portal with the exact account you traded with during Season 1 or Season 2. Allocations are tied to that account, so use the same email and wallet.":
    "登录 GRVT 网站，然后使用你在第 1 季或第 2 季期间交易的确切账户前往奖励 portal。分配与该账户绑定，因此请使用相同的电子邮件和钱包。",
  "Stake JUP Through the Governance Portal":
    "通过治理 portal 进行质押 JUP",
  "Submit a Base Network Address You Control":
    "提交你控制的 Base 网络地址",
  "Switch to Base and Fund Your Wallet":
    "切换到 Base 并为你的钱包充值",
  "Take part in the weekly Gacha Games for badges and a share of points prize pools. These themed challenges reward consistent participation and add to your quarterly standing.":
    "参加每周的 Gacha 游戏，赢取徽章并分享积分奖池。这些主题挑战奖励持续参与并提高你的季度排名。",
  "The portal verifies the X account you linked during the campaign before it shows a balance. Approve the sign-in request so your GynPoints can be matched to the connected wallet.":
    "portal 会在显示余额之前验证你在活动期间链接的 X 帐户。批准登录请求，以便你的 GynPoints 可以与连接的钱包相匹配。",
  "The project lists its official Base contract as 0xB095274743941e953c746F9C228DA9c18Bb6ec29 . Verify it on the official LAPTOP website rather than a screener or a search result. Our crypto safety guide explains how fake claim pages work.":
    "该项目将其官方 Base 合约列为 0xB095274743941e953c746F9C228DA9c18Bb6ec29。在官方 LAPTOP 网站上验证它，而不是通过筛选器或搜索结果。我们的加密货币安全指南解释了虚假领取页面的工作原理。",
  "This step is optional. Committing your deposit to a fixed 3-month or 6-month lock multiplies the Feathers you earn over that period. Only lock capital you are comfortable leaving in place, since locked positions cannot be withdrawn until the term ends.":
    "此步骤是可选的。将你的存款存入固定的 3 个月或 6 个月锁定期，将使你在此期间赚取的 Feathers 成倍增加。仅锁定你愿意保留的资本，因为锁定头寸在期限结束之前无法撤回。",
  "USDe works beyond Ethereum, and activity on other chains qualifies for points and ecosystem rewards. Bridge USDe using a service like the bridge below, then connect a Solana or Avalanche wallet on the Sats page to keep earning across networks. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "USDe 的工作超越 Ethereum，其他链上的活动有资格获得积分和生态系统奖励。使用类似下面跨链的服务跨链 USDe，然后在 Sats 页面上连接 Solana 或 Avalanche 钱包以继续跨网络赚钱。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "Visit the Olympus Aptos claim page":
    "访问 Olympus Aptos 领取页面",
  "Visit the Push Portal":
    "访问 Push portal",
  "Visit the Ritual quest portal and log in with your Discord account. Complete available tasks to earn XP and role upgrades. Current quest categories include: Social tasks Discord engagement and invites Pledge section submissions (if open — submit unique text when active)":
    "访问 Ritual 任务 portal 并使用你的 Discord 帐户登录。完成可用任务即可获得 XP 和角色升级。当前的任务类别包括： 社交任务 Discord 参与和邀请承诺板块（如果开放 - 激活时提交唯一文本）",
  "Visit the Wager Predict app and connect MetaMask or any WalletConnect wallet. Grab free tBNB for gas by clicking the faucet button.":
    "访问 Wager Predict 应用程序并连接 MetaMask 或任何 WalletConnect 钱包。点击水龙头按钮，即可获取免费的 tBNB Gas。",
  "Visit the claim portal and connect your registered wallet to claim your allocation. Season 1 Airdrop Eligibility The Season 1 Airdrop rewards contributors across the Plume ecosystem. Both Early Adopters and Global Community Members had to complete the registration form to qualify for the claim. Early Adopters Testnet Users with Miles: Rewards are distributed above a set threshold on a tier-based system, calculated from Plume Miles, Stamps earned, and airplane mode tasks. Anti-sybil measures apply to protect genuine participants. Active Community Members: Holders of select Plume Discord roles who took part in the testnet campaign. Pre-Deposit Stakers: Users who deposited above a threshold across the three StakeStone and Nest pre-deposit campaigns and held funds until TGE, with rewards proportional to deposit size. The third campaign snapshot was taken January 18 at 5:00 PM UTC. Global Community Members Select RWA and Plume-aligned communities are also included: Polymarket Ondo World Liberty Financial (WLFI) AIXBT by Virtuals Select users of Backed Assets, Dinari, and Swarm X":
    "访问领取 portal 并连接你注册的钱包以领取你的分配。第一季空投资格第一季空投奖励整个 Plume 生态系统的贡献者。早期采用者和全球社区成员都必须填写注册表才能获得领取资格。拥有里程的早期采用者测试网用户：奖励在基于等级的系统上高于设定阈值时分配，根据 Plume 里程、赚取的印章和飞行模式任务计算。反女巫措施适用于保护真正的参与者。活跃社区成员：参与测试网活动的选定 Plume Discord 角色的持有者。预存款质押者：在三个 StakeStone 和 Nest 预存款活动中存款超过阈值并持有资金直至 TGE 的用户，奖励与存款规模成正比。第三个活动快照拍摄于世界标准时间 1 月 18 日下午 5:00。全球社区成员还包括选定的 RWA 和 Plume 联盟社区： Polymarket Ondo World Liberty Financial (WLFI) AIXBT by Virtuals 支持资产、Dinari 和 Swarm X 的精选用户",
  "Visit the submission portal and sign in with the EVM wallet you registered Create or select a Canopy wallet to receive tokens The locked portion is already credited to your wallet and releases on its own schedule, so there is nothing further to claim, sign, or pay gas for.":
    "访问提交 portal 并使用你注册的 EVM 钱包登录创建或选择 Canopy 钱包来接收代币锁定部分已记入你的钱包并按其自己的时间表释放，因此无需再声明、签名或支付 Gas 费。",
  "Work out which of the three groups applies to you first. Substack and Channel 5 recipients claim by email through the official portal. TRUMP loss recipients never use it, since those tokens move through exchanges.":
    "找出这三组中哪一组首先适合你。 Substack 和 Channel 5 收件人通过官方 portal 通过电子邮件领取。 TRUMP 损失接收者永远不会使用它，因为这些代币通过交易所移动。",
  "Work through the active campaigns on the portal. Each issues a soulbound token on completion, and SBT holdings are a named eligibility category. Types rotate weekly: Prediction campaigns, where you commit to an outcome and mint an SBT on resolution X Spaces attendance drops and Engagement Basecamp quests Partner project campaigns run through TBook for other protocols":
    "完成 portal 上的活跃活动。每个项目在完成后都会发行一个 Soulbound 代币，并且 SBT 持仓是一个指定的资格类别。类型每周轮换： 预测活动，你承诺结果并在决议 X Spaces 出勤率下降和参与 Basecamp 任务上铸造 SBT 合作伙伴项目活动通过 TBook 运行其他协议",
  "You need APT to cover gas plus the $0.20 anti-sybil fee per claim. You can buy APT on Bybit and withdraw it straight to your Aptos address. If you also plan to use Olympus on its other chains, the widget below lets you bridge or swap funds to the network you need. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "你需要 APT 来支付 Gas 费以及每次领取 0.20 美元的反女巫费用。你可以在 Bybit 上购买 APT 并将其直接提现到你的 Aptos 地址。如果你还计划在其他链上使用 Olympus，下面的组件可让你跨链或交换资金到你需要的网络。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",
  "You need USD1 or U plus a little BNB for gas. Stablecoins can be bought on Bybit and withdrawn straight to BNB Chain. If your funds sit elsewhere, the widget below will bridge or swap them across. Bridge funds Swap and bridge across 30+ chains without leaving this page. Fast routes, low fees. Bridge now Opens an interactive bridge widget Open the bridge in a new tab":
    "你需要 USD1 或 U 加上一点 BNB 用于支付 Gas。稳定币可以在 Bybit 购买并直接提现到 BNB Chain。如果你的资金位于其他地方，下面的组件将跨链或交换它们。跨链资金无需离开此页面即可在 30 多个链之间进行交换和跨链。路线快，费用低。现在桥打开交互式桥组件在新标签页中打开桥",


  /**
   * ⚠️ 基线回归项（独立审查 P1，务必保留）：
   *   下面 3 条在 277ef35c 那轮批量改写 HUMAN_FIX 时被**误删**，
   *   结果用户可见文案从「好中文」退回「机器中文」：
   *     · Access the Rewards Section  → 「访问奖励部分」（回到「进入奖励页面」）
   *     · Season 1 … $125,000         → 「分发 125,000 美元」（回到「发放 12.5 万美元」）
   *     · Enter at least $10 after fees … → 「换成 1 美元…保管库」（USD1 被吞）
   *   「0 处英文残留」类门禁天然测不到这类退化 —— 它们是中文，只是更差。
   */
  "Access the Rewards Section":
    "进入奖励页面",
  "The Season 1 airdrop is confirmed and distributes $125,000 worth of $MNTD to eligible players based on verified platform activity.":
    "第 1 季空投已确认，将根据已验证的平台活动，向符合条件的玩家发放价值 12.5 万美元的 $MNTD。",
  "Enter at least $10 after fees, then approve and confirm. Holding a different token is fine, since the deposit flow swaps into USD1 or U first. Once the phase cap fills, the vault stops taking new money while existing deposits keep running.":
    "扣除手续费后至少存入 $10，然后授权并确认。持有其他代币也可以，存款会先自动换成 USD1 或 U。一旦该阶段额度满了，金库会停止接受新资金，已有存款继续计息。",
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
