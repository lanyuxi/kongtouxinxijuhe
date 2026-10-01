import { useState } from 'react';
import type { XSettingsController } from '../lib/use-x-settings';
export function SettingsView({ x }: { x: XSettingsController }) {
  const [token, setToken] = useState(''); const [show, setShow] = useState(false);
  const running = x.result.task?.state === 'running';
  const disabled = x.available !== 'available' || x.loading || !!x.busy;
  const perform = (run: () => Promise<void>) => { void run().catch(() => {}); };
  const format = (value: string) => new Date(value).toLocaleString('zh-CN');
  return (
    <div className="mx-auto max-w-5xl">
      <a href="#/latest" className="text-sm text-brand hover:underline">← 返回空投列表</a>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">设置</p><h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">X API 配置</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">连接项目方的一手动态。每位访客使用自己的凭据，配置和抓取结果相互独立。</p></div>
        <span className={`chip ${x.settings?.configured ? 'border-ok/30 bg-ok-wash text-ok' : 'border-line bg-white text-ink-soft'}`}>{x.settings?.configured ? '已配置' : '未配置'}</span>
      </div>
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className="card min-w-0">
          <h2 className="panel-title">连接你的 X API</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">只需填写 Bearer Token（访问凭据）。已保存的凭据不会回显；填写新值可以更换配置。</p>
          {x.available === 'unavailable' && <div className="mt-4 rounded-xl border border-warn/30 bg-warn-wash p-4 text-sm text-warn" role="status">{x.message || '当前部署未接入配置后台'}。此页面需要配套后台才能保存、检测和抓取。<button className="mt-2 block underline" onClick={() => perform(x.reload)}>重新连接后台</button></div>}
          <form className="mt-5" onSubmit={e => { e.preventDefault(); perform(async () => { await x.save(token); setToken(''); setShow(false); }); }}>
            <label htmlFor="x-token" className="block text-sm font-medium text-ink">Bearer Token（访问凭据）</label>
            <div className="mt-2 flex gap-2">
              <input id="x-token" name="x-token" type={show ? 'text' : 'password'} value={token} onChange={e => { setToken(e.target.value); x.clearMessage(); }} autoComplete="off" spellCheck={false} maxLength={4096} disabled={disabled} placeholder={x.settings?.configured ? '已保存 · 输入新凭据以更换' : '粘贴从 X 控制台取得的 Bearer Token'} className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-50" />
              <button type="button" aria-pressed={show} className="btn-ghost shrink-0 px-3" onClick={() => setShow(v => !v)}>{show ? '隐藏' : '显示'}</button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">密钥由后台加密保存，不写入浏览器收藏备份。同一浏览器可继续使用；换浏览器或清除会话后需要重新配置。</p>
            <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || !token.trim()}>{x.busy === 'save' ? '正在检测并保存…' : '保存并检测'}</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost disabled:opacity-50" disabled={disabled || !x.settings?.configured} onClick={() => perform(x.test)}>{x.busy === 'test' ? '正在检测…' : '重新检测'}</button>
            <button className="btn-ghost disabled:opacity-50" disabled={disabled || !x.settings?.configured || running} onClick={() => perform(x.refresh)}>{running ? '正在抓取…' : '更新我的 X 情报'}</button>
            <button className="btn-ghost text-danger disabled:opacity-50" disabled={disabled || !x.settings?.configured} onClick={() => perform(async () => { await x.remove(); setToken(''); })}>{x.busy === 'remove' ? '正在删除…' : '删除配置'}</button>
          </div>
          <div className="mt-5 rounded-xl border border-line-soft bg-surface-muted p-4 text-sm" aria-live="polite" role="status">
            {x.loading ? <p>正在连接配置后台…</p> : <>
              <p className={x.failed ? 'text-danger' : 'text-ink-soft'}>{x.message || (x.settings?.configured ? '配置已保存，可重新检测或更新你的 X 情报。' : '尚未配置，请先按申请说明取得访问凭据。')}</p>
              {x.settings?.testedAt && <p className="mt-2 text-xs text-ink-faint">上次成功检测：{format(x.settings.testedAt)}</p>}
              {running && <p className="mt-2 text-brand">正在检查官方账号：{x.result.task!.checked} / {x.result.task!.total}</p>}
              {x.result.task && !running && <p className="mt-2 text-xs text-ink-faint">本轮读取 {x.result.task.checked} / {x.result.task.total} 个账号；个人 X 检查时间与公共项目库更新时间分别记录。</p>}
              {x.result.task?.failures.length ? <p className="mt-2 text-sm text-warn">{x.result.task.failures[0].error.message}</p> : null}
            </>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">保存并检测通过后会自动抓取。每轮最多读取 40 个官方账号、每账号 10 条近期推文；可能产生 API 费用。请勿连续重复检测或抓取。</p>
        </section>
        <section className="card min-w-0">
          <h2 className="panel-title">第一次配置？跟着四步走</h2>
          <ol className="mt-5 space-y-5 text-sm leading-relaxed text-ink-soft">
            <li><strong className="text-ink">1. 申请开发者账号</strong><p className="mt-1">打开 <a href="https://console.x.com/" target="_blank" rel="noopener noreferrer" className="text-brand underline">X 开发者控制台 ↗</a>，登录 X，接受开发者协议并填写 API 用途。</p></li>
            <li><strong className="text-ink">2. 创建应用</strong><p className="mt-1">点击 New App（新建应用），填写名称、描述和用途，例如“读取公开的空投项目动态”。</p></li>
            <li><strong className="text-ink">3. 取得访问凭据</strong><p className="mt-1">找到 Bearer Token，复制到左侧输入框。凭据可能只显示一次，请妥善保存。本页不需要 X 登录密码或其他密钥。</p></li>
            <li><strong className="text-ink">4. 确认额度并检测</strong><p className="mt-1">在控制台确认 API 余额与消费上限，再点击“保存并检测”。检测会真实读取一个官方账号及其近期推文；失败时根据提示修改。</p></li>
          </ol>
          <div className="mt-6 rounded-xl border border-warn/30 bg-warn-wash p-4 text-sm leading-relaxed text-ink-soft"><strong className="text-warn">费用说明</strong><p className="mt-1">X API 按用量计费，检测也会发起请求。价格和可用额度以控制台为准，建议先设置消费上限。</p></div>
          <div className="mt-5 flex flex-wrap gap-4 text-sm"><a href="https://docs.x.com/x-api/getting-started/getting-access" target="_blank" rel="noopener noreferrer" className="text-brand underline">官方申请说明 ↗</a><a href="https://docs.x.com/x-api/getting-started/pricing" target="_blank" rel="noopener noreferrer" className="text-brand underline">官方计费说明 ↗</a></div>
          <p className="mt-5 text-xs leading-relaxed text-ink-faint">X 动态只作为信息线索，不会仅凭关键词就改变项目的领取状态、参与评分或教程。推文原文可能是英文。</p>
        </section>
      </div>
    </div>
  );
}
