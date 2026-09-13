/**
 * 首访新手引导（3 步浮层）+ 常驻安全四句。
 *
 * 为什么必须做这件事（第一性原理）：
 *   首页默认直接抛出一屏项目卡片 + 6 个筛选器 + 5 种排序。
 *   对已经懂空投的人是效率工具，对第一次来的人却是「这是啥、我该点哪」。
 *   而本项目面向的恰恰是新手。所以第一屏必须先回答三个问题：
 *     ① 这里是什么（一句话）
 *     ② 我最该怕什么（防骗，这是新手最大的损失来源）
 *     ③ 我该从哪开始点（把「新手友好」筛选直接指给他）
 *
 * 为什么用「浮层 + 可跳过」而不是跳转独立引导页：
 *   零服务端、纯静态站点不应该为一次性引导增加一条路由；
 *   浮层不改变 URL，也不影响 hash 路由与收藏书签。
 *
 * 记忆策略：LocalStorage 记一个版本号。
 *   版本号变化时会重新展示一次 —— 后续若引导内容有重要更新，
 *   老用户也能看到新说明，而不是被永久静默。
 */

import { useEffect, useState } from 'react';

const KEY = 'dropscope.onboarding.v1';

/** 引导内容版本：修改引导文案时递增，老用户会重新看到一次 */
export const ONBOARDING_VERSION = 1;

export const SAFETY_LINES = [
  '只用专用的「空投小号」钱包，绝不使用存有资产的主钱包。',
  '任何页面要求输入助记词、私钥、Keystore —— 一律是骗局，立刻关闭。',
  '没有人会私信送你空投，主动联系你的「官方客服」都是假的。',
  '签名前看清内容：只为「领取」付 Gas，绝不为「领取」先转账。',
];

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '这里是什么？',
    body: (
      <>
        <p>
          这是一个<strong className="text-ink">空投情报站</strong>。它把公开渠道的空投线索聚合起来，
          再帮你判断三件事：<strong className="text-ink">真的假的、值不值得做、具体怎么做</strong>。
        </p>
        <p className="mt-3">
          列表里的每一项都带真实性、风险、价值三套独立评分，点开就能看到<strong className="text-ink">评分的理由与来源</strong>，
          不是一句「推荐」就完事。
        </p>
      </>
    ),
  },
  {
    title: '先记住这四句，能躲开 90% 的坑',
    body: (
      <>
        <p className="mb-3 text-ink-soft">空投最大的损失不是「没撸到」，而是「撸的过程中被骗」。请务必做到：</p>
        <ul className="flex flex-col gap-2.5">
          {SAFETY_LINES.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              <span className="text-ink">{line}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    title: '从这里开始',
    body: (
      <>
        <p>
          不确定从哪下手？点筛选栏里的
          <span className="mx-1 rounded-full border border-ok/30 bg-ok-wash px-2 py-0.5 text-xs font-medium text-ok">
            🌱 只看新手友好
          </span>
          ，它会只留下<strong className="text-ink">无需本金、Gas 很低、风险可控、无需签名授权</strong>的项目。
        </p>
        <p className="mt-3">
          看中一个就先点<strong className="text-ink">☆ 收藏</strong>，在「我的关注」里按步骤勾选进度。
          收藏与进度只存在你自己的浏览器里，不会上传服务器。
        </p>
      </>
    ),
  },
];

/** 判断是否首次访问（按版本号） */
export function shouldShowOnboarding(storage: Storage | undefined = safeStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(KEY) !== String(ONBOARDING_VERSION);
  } catch {
    return false;
  }
}

function markSeen(storage: Storage | undefined = safeStorage()) {
  try {
    storage?.setItem(KEY, String(ONBOARDING_VERSION));
  } catch {
    /* 隐私模式下写入失败：不阻塞使用 */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (shouldShowOnboarding()) setOpen(true);
  }, []);

  // Esc 关闭 + 阻止背景滚动
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    markSeen();
    setOpen(false);
  };

  if (!open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4 py-8 backdrop-blur-sm"
    >
      <div className="card w-full max-w-2xl shadow-card">
        {/* 进度点 */}
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-brand' : 'w-4 bg-line'
              }`}
            />
          ))}
          <span className="ml-auto text-xs text-ink-faint">
            第 {step + 1} / {STEPS.length} 步
          </span>
        </div>

        <h2
          id="onboarding-title"
          className="mt-5 text-2xl font-semibold tracking-tight text-ink"
        >
          {current.title}
        </h2>
        <div className="mt-4 text-base leading-relaxed text-ink-soft">{current.body}</div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (last ? close() : setStep((s) => s + 1))}
            className="btn-primary"
          >
            {last ? '开始浏览' : '下一步'}
          </button>
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="btn-ghost">
              上一步
            </button>
          )}
          <button type="button" onClick={close} className="btn-quiet ml-auto">
            跳过引导
          </button>
        </div>
      </div>
    </div>
  );
}

/** 常驻安全四句横条（无论是否看过引导都显示，防骗提示必须长期可见） */
export function SafetyBar() {
  return (
    <details className="card border-warn/30 bg-warn-wash/60">
      <summary className="cursor-pointer select-none text-sm font-medium text-warn">
        🛡 新手安全四句 —— 参与任何空投前请先读一遍
      </summary>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {SAFETY_LINES.map((line, i) => (
          <li key={i} className="flex gap-3 text-sm text-ink-soft">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
