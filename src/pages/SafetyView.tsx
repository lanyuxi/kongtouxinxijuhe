/**
 * 防骗自查页（骗局图鉴 + 域名 / 地址自查）。
 *
 * 为什么单独做一个页面，而不是塞进弹窗（第一性原理）：
 *   防骗内容需要「反复看」而不是「看一次」。
 *   浮层会被关掉、常驻横条只有四句话，都不足以承载「一种骗局长什么样」这种
 *   需要图文对照的知识。竞品（RugCheck / Wallet Guard）都把防骗做成独立入口，
 *   因为这是新手留存最高、也最该被反复查证的一块。
 *
 * 与「一键更新」「列表页」的关系：
 *   本页纯静态、零数据依赖（除官方域名清单外不读其他数据），
 *   因此即便数据源全部失败，防骗内容依然可用 —— 这本身就是一条独立的兜底。
 */

import { useMemo, useState } from 'react';
import type { ListProject } from '../lib/types';
import { SCAM_TYPES, buildOfficialDomains, checkDomain } from '../lib/scam';
import type { CheckResult } from '../lib/scam';

const VERDICT_STYLE: Record<CheckResult['verdict'], string> = {
  official: 'border-ok/40 bg-ok-wash text-ok',
  lookalike: 'border-danger bg-danger-wash text-danger',
  phishing_signal: 'border-danger/50 bg-danger-wash text-danger',
  unknown: 'border-warn/40 bg-warn-wash text-warn',
  invalid: 'border-line bg-page text-ink-soft',
};

const VERDICT_LABEL: Record<CheckResult['verdict'], string> = {
  official: '✓ 与已知官方域名一致',
  lookalike: '⛔ 疑似仿冒站点',
  phishing_signal: '⚠ 疑似钓鱼站点',
  unknown: '？ 本库未收录',
  invalid: '— 输入无效',
};

export function SafetyView({ projects }: { projects: ListProject[] }) {
  const officialDomains = useMemo(() => buildOfficialDomains(projects), [projects]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);

  const handleCheck = () => {
    setResult(checkDomain(input, officialDomains));
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 顶部说明 */}
      <section className="panel">
        <h1 className="text-3xl font-bold tracking-tight text-ink">防骗自查</h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-soft">
          空投最大的损失不是「没撸到」，而是「撸的过程中被骗」。
          本页先教你识别常见骗局长什么样，再提供一个自查框 ——
          粘贴网址就能比对本站已知的官方域名，看看是不是仿冒。
        </p>
        <div className="mt-5 rounded-2xl border border-danger/30 bg-danger-wash px-5 py-4 text-sm text-danger">
          记住一句话：<strong>任何要求你输入助记词、私钥、Keystore 的页面，一律是骗局。</strong>
          并且真正的空投永远不会要求你先转账才能领取。
        </div>
      </section>

      {/* 地址 / 域名自查 */}
      <section className="panel">
        <h2 className="panel-title">① 网址 / 地址自查</h2>
        <p className="mt-3 text-base text-ink-soft">
          粘贴你准备访问的网址（或一个钱包地址），本站会与已核实的
          <strong className="text-ink"> {Object.keys(officialDomains).length} </strong>
          个官方域名做比对。自查完全在你的浏览器里进行，不发送任何数据。
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="例如 https://app.uniswap.org 或 0x1234…abcd"
            aria-label="粘贴网址或钱包地址"
            className="select w-full flex-1"
          />
          <button type="button" onClick={handleCheck} className="btn-primary shrink-0">
            立即自查
          </button>
        </div>

        {result && (
          <div className={`mt-5 animate-fade-up rounded-2xl border px-6 py-5 ${VERDICT_STYLE[result.verdict]}`}>
            <p className="text-base font-semibold">{VERDICT_LABEL[result.verdict]}</p>
            <p className="mt-2 text-base font-medium">{result.summary}</p>
            {result.detail && <p className="mt-2 text-sm leading-relaxed opacity-90">{result.detail}</p>}
            {result.verdict !== 'official' && result.verdict !== 'invalid' && (
              <p className="mt-3 text-sm opacity-90">
                在链接里签过名？请到{' '}
                <a
                  href="https://revoke.cash"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  revoke.cash ↗
                </a>{' '}
                撤销授权。
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-sm text-ink-faint">
          自查只能判断「是否与已知官方域名一致」，<strong>不能证明陌生链接是安全的</strong>。
          「本库未收录」不等于安全，也不等于一定是假站 —— 请以项目官方公告中的链接为准。
        </p>
      </section>

      {/* 骗局图鉴 */}
      <section className="panel">
        <h2 className="panel-title">② 骗局图鉴：一种骗局一屏</h2>
        <p className="mt-3 text-base text-ink-soft">
          下面这 {SCAM_TYPES.length} 种骗局覆盖了绝大多数空投相关的资产损失场景。
          每种都给出：长什么样、骗子想要什么、怎么识破、中招了怎么办。
        </p>

        <div className="mt-6 flex flex-col gap-5">
          {SCAM_TYPES.map((s, i) => (
            <article key={s.id} className="rounded-2xl border border-line-soft bg-page/40 px-6 py-6">
              <h3 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight text-ink">
                <span aria-hidden className="metric text-base text-ink-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.title}
              </h3>

              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-ink-faint">长什么样</dt>
                  <dd className="mt-1.5 text-base leading-relaxed text-ink-soft">{s.appearance}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-ink-faint">骗子想要什么</dt>
                  <dd className="mt-1.5 text-base leading-relaxed text-ink-soft">{s.intent}</dd>
                </div>
              </dl>

              <div className="mt-5 rounded-xl border border-line-soft bg-white px-5 py-4">
                <p className="text-sm font-medium text-ink">怎么识破</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {s.clues.map((c, j) => (
                    <li key={j} className="flex gap-3 text-sm text-ink-soft">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 rounded-xl border border-danger/25 bg-danger-wash/60 px-5 py-3.5 text-sm text-danger">
                <strong className="font-semibold">中招了怎么办：</strong>
                {s.aftermath}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 收尾提醒 */}
      <section className="panel">
        <h2 className="panel-title">③ 做完之后的例行动作</h2>
        <ol className="mt-4 flex flex-col gap-3 text-base text-ink-soft">
          <li>
            <strong className="text-ink">1. 撤销不必要的授权</strong> —— 到{' '}
            <a
              href="https://revoke.cash"
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand underline-offset-2 hover:underline"
            >
              revoke.cash ↗
            </a>{' '}
            连接参与活动用的钱包，把不用的授权全部撤销。
          </li>
          <li>
            <strong className="text-ink">2. 检查是否被加入可疑合约</strong> ——
            留意你完全不认识的合约授权，一并撤销。
          </li>
          <li>
            <strong className="text-ink">3. 把不用的空投钱包归零</strong> ——
            小号只留几美元 Gas，不要长期存放资产。
          </li>
        </ol>
        <p className="mt-4 text-sm text-ink-faint">
          每个项目详情页底部也有同样的「做完收尾」三步清单，做项目时可以直接对照执行。
        </p>
      </section>
    </div>
  );
}
