/**
 * 撤离与授权撤回清单（参与完成后的收尾动作）。
 *
 * 为什么必须放在每个项目页底部（第一性原理）：
 *   新手最常见的损失不是「没撸到空投」，而是「撸的过程中把主钱包搭进去」。
 *   授权（approve / permit）是链上最容易被忽略的持久风险：
 *   一次「领取」签名可能同时授予合约无限额度转账权，活动结束后授权依然存在，
 *   合约一旦被攻击或本身就是恶意的，钱包里的资产会被直接转走。
 *   而这条风险**不会随项目结束而消失**，所以必须在用户「做完」这个动作点上提醒。
 *
 * 放置位置：教程区之后、注意事项之前。
 *   放在教程后面，是因为用户读完步骤才需要执行收尾；
 *   放在注意事项前面，是因为它是「照做即可完成」的确定性动作，
 *   比泛泛的注意事项更需要被看到。
 *
 * 内容取舍：
 *   - 只给「谁都能立刻做」的三步，不引入需要付费的第三方工具；
 *   - 明确标注本站不接入钱包、不代持资产，避免用户误以为这里能一键撤销；
 *   - 站点是零服务端的纯静态站，因此不弹窗、不打断，用可折叠卡片长期驻留。
 */

import { useState } from 'react';

/** 单条收尾动作 */
interface ExitItem {
  order: string;
  title: string;
  /** 这意味着什么（新手视角解释） */
  why: string;
  /** 具体怎么做 */
  how: React.ReactNode;
}

const REVOKE_URL = 'https://revoke.cash/zh';
const HELP_URL = 'https://revoke.cash/zh/learn/security/what-to-do-when-scammed';

/** 先判断风险类型，再处理对应权限；本站不执行链上操作。 */
export const EXIT_ITEMS: ExitItem[] = [
  {
    order: '①', title: '核对并撤销不再需要的授权',
    why: 'ERC-20 授权允许指定地址在额度内转走代币；NFT 可按单枚或整个系列授权。断开网站连接不会撤销这些链上权限。被列入白名单本身不会赋予扣款权限。',
    how: <>先核对链、代币或 NFT、被授权地址和额度。在 <a href={REVOKE_URL} target="_blank" rel="noreferrer noopener">中文授权检查工具 ↗</a> 查看自己的地址记录，确认不再需要后再撤销。撤销通常需要网络手续费，须确认交易成功；它不会撤销所有其他签名。</>,
  },
  {
    order: '②', title: '区分已完成转账与未使用的签名',
    why: '资产已经转走时，撤销授权不能追回资产。离线签名、市场订单、Permit 等还可能需要对应的取消操作，不能只凭授权列表判断钱包已安全。',
    how: <>查看钱包和区块浏览器的交易记录，辨认转账、授权及签名。不要继续点击可疑页面或为“追回资产”付款。可参考 <a href={HELP_URL} target="_blank" rel="noreferrer noopener">风险类型与处理说明 ↗</a>；该资料部分正文仍为英文。</>,
  },
  {
    order: '③', title: '凭据泄露时停用受影响的钱包',
    why: '助记词或私钥泄露意味着对方可控制钱包；撤销授权或断开连接不能恢复独占控制。仅仅收到陌生代币不代表凭据已经泄露。',
    how: <>疑似泄露时停止向该钱包充值，先确认设备安全，再评估已知资产向全新钱包迁移的方案；不要继续使用泄露的助记词。陌生代币或 NFT 不要为了“归零”去转移、出售、授权或打开它们附带的链接。存在自动盗转时，不要盲目补充手续费。</>,
  },
];

export function ExitChecklist() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-warn/30 bg-warn-wash/50 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold text-ink">
          🧹 安全收尾：核对授权、交易与钱包凭据
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="btn-quiet !px-3 !py-1.5 !text-sm"
        >
          {open ? '收起' : '展开三步收尾'}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        断开页面连接不等于撤销链上授权。先判断发生了什么，再处理对应权限；没有一个收尾按钮能保证所有风险消失。
      </p>

      {open && (
        <ol className="mt-5 flex flex-col gap-4">
          {EXIT_ITEMS.map((item) => (
            <li
              key={item.order}
              className="animate-fade-up rounded-xl border border-line-soft bg-white px-5 py-4"
            >
              <p className="text-base font-semibold text-ink">
                <span aria-hidden className="mr-2 text-warn">
                  {item.order}
                </span>
                {item.title}
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                <strong className="font-medium text-ink">意味着：</strong>
                {item.why}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                <strong className="font-medium text-ink">怎么办：</strong>
                {item.how}
              </p>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-sm text-ink-faint">
        本站不接入钱包、不代持资产，因此无法替你撤销授权 —— 授权只能在区块链上由你本人发起撤销。
        以上链接均为第三方工具，请核对域名后再连接钱包。
      </p>
    </div>
  );
}
