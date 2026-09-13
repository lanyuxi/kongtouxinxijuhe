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

const REVOKE_URL = 'https://revoke.cash';
const ZERION_URL = 'https://revoke.cash/explore';

/** 新手需要执行的三步收尾动作（顺序即建议执行顺序） */
export const EXIT_ITEMS: ExitItem[] = [
  {
    order: '①',
    title: '撤回不必要的代币授权',
    why: '你为了参与活动签过的「授权」不会自动失效，额度可能一直留着。合约若被攻破或本就是恶意的，钱包里的资产会被转走。',
    how: (
      <>
        打开{' '}
        <a href={REVOKE_URL} target="_blank" rel="noreferrer noopener">
          revoke.cash ↗
        </a>
        ，连接你参与活动用的那个钱包，把不再需要的授权逐个撤销（Revoke）。
        撤销本身只花一笔 Gas，但它把「无限额度」收回到 0。
      </>
    ),
  },
  {
    order: '②',
    title: '检查是否被加入可疑合约',
    why: '有些恶意合约会把你加入「白名单 / 黑名单」快照，后续用来误导签名或批量扣款。',
    how: (
      <>
        在{' '}
        <a href={ZERION_URL} target="_blank" rel="noreferrer noopener">
          revoke.cash 的授权浏览 ↗
        </a>
        {' '}输入你的钱包地址，看一眼参与过的合约清单。
        出现你完全不认识、又不打算再用的项目，一并撤销授权。
      </>
    ),
  },
  {
    order: '③',
    title: '把不用的空投钱包归零',
    why: '空投小号一旦长期放着资产，就会从「消耗品」变成「需要保护的钱包」，风险反而更大。',
    how: (
      <>
        把参与活动的小号钱包里剩余资产转回你的常用钱包，
        之后这个地址只保留几美元 Gas 即可。若不再使用，就不要往里添加任何资产。
      </>
    ),
  },
];

export function ExitChecklist() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-warn/30 bg-warn-wash/50 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold text-ink">
          🧹 做完别忘了收尾 —— 撤回授权、检查合约、钱包归零
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
        空投最大的损失往往发生在「做完之后」：授权不撤销，钱包就一直对别人敞着门。
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
