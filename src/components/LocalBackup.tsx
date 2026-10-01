import { useRef, useState } from 'react';
import { serializeBackup } from '../lib/store';
import type { LocalState } from '../lib/store';

export function LocalBackup({ state, onImport, onClear, unavailable = 0 }: {
  state: LocalState; onImport: (text: string) => number; onClear: () => void; unavailable?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([serializeBackup(state)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `空投收藏备份-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('备份已生成。请保管下载的 JSON 文件，换浏览器后可导入。');
  };
  return <section className="card !p-5" aria-labelledby="backup-title">
    <h1 id="backup-title" className="panel-title">我的关注</h1>
    <p className="mt-2 text-sm text-ink-soft">{state.favorites.length} 个收藏 · 记录仅在此浏览器保存，请定期导出。导入采用合并，已有项目记录优先，不上传文件。</p>
    {unavailable > 0 && <p className="mt-2 text-sm text-warn">当前资料库未收录的 {unavailable} 个收藏仍保留在本地与备份中。</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button className="btn-ghost" onClick={exportFile}>导出备份</button>
      <button className="btn-ghost" onClick={() => input.current?.click()}>导入备份</button>
      <button className="btn-quiet" onClick={() => { if (window.confirm('清空此浏览器的全部收藏与进度？建议先导出备份。')) { onClear(); setMessage('已清空此浏览器的收藏与进度。'); } }}>清空本地记录</button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="选择收藏备份文件" onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          if (file.size > 1_000_000) throw new Error('备份超过 1 MB，请选择本站导出的 JSON 文件。');
          const count = onImport(await file.text());
          setMessage(`已合并 ${count} 个备份收藏；已有记录保留。教程变化时需重新核对。`);
        } catch (err) { setMessage(err instanceof Error ? err.message : '无法读取备份，现有记录未改变。'); }
      }} />
    </div>
    {message && <p className="mt-3 text-sm text-ink" role="status">{message}</p>}
  </section>;
}
