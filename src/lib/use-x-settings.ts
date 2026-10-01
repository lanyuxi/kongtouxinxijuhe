import { useEffect, useRef, useState } from 'react';
import { deleteXSettings, getXResult, getXSettings, refreshX, saveXSettings, testXSettings, XRequestError } from './x-api';
import type { XResult, XSettings } from './x-api-types';
const emptyResult = (): XResult => ({ task: null, lastSuccessAt: null, accounts: [] });
export function useXSettings(onCompleted?: () => Promise<void>) {
  const [available, setAvailable] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [settings, setSettings] = useState<XSettings | null>(null);
  const [result, setResult] = useState<XResult>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | 'refresh' | null>(null);
  const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  const mounted = useRef(true); const generation = useRef(0); const busyRef = useRef(false);
  const lastCompleted = useRef<string | null>(null); const onDone = useRef(onCompleted); onDone.current = onCompleted;
  const displayError = (e: unknown) => { setMessage(e instanceof Error ? e.message : '操作失败，请重试。'); setFailed(true); };
  const reload = async () => {
    const ticket = ++generation.current; setLoading(true);
    try {
      const next = await getXSettings(); const data = await getXResult();
      if (!mounted.current || ticket !== generation.current) return;
      setSettings(next); setResult(data); setAvailable('available');
      if (next.testError) { setMessage(next.testError.message); setFailed(true); }
    } catch (e) {
      if (mounted.current && ticket === generation.current) { setAvailable(e instanceof XRequestError && e.code === 'unavailable' ? 'unavailable' : 'available'); displayError(e); }
    } finally { if (mounted.current && ticket === generation.current) setLoading(false); }
  };
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    if (result.task?.state !== 'running') return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ticket = generation.current;
      try {
        const data = await getXResult();
        const next = data.task?.state !== 'running' ? await getXSettings() : null;
        if (cancelled || !mounted.current || ticket !== generation.current || busyRef.current) return;
        setResult(data);
        if (next) setSettings(next);
      } catch (e) { if (!cancelled && ticket === generation.current) displayError(e); }
      finally { if (!cancelled) timer = setTimeout(poll, 2000); }
    };
    timer = setTimeout(poll, 2000); return () => { cancelled = true; clearTimeout(timer); };
  }, [result.task?.id, result.task?.state]);
  useEffect(() => {
    const task = result.task;
    if (!task || task.state === 'running' || lastCompleted.current === task.id) return;
    lastCompleted.current = task.id;
    if (settings?.testError) { setFailed(true); setMessage(settings.testError.message); return; }
    const success = task.state === 'success' || task.state === 'partial';
    const prefix = task.state === 'success' ? '本轮 X 抓取完成' : task.state === 'partial' ? '本轮部分账号抓取成功，未更新账号保留上次数据' : '本轮 X 抓取失败，保留上次成功数据';
    const posts = result.accounts.filter(a => !a.stale).flatMap(a => a.posts);
    setFailed(!success); setMessage(`${prefix}${success && task.dataChanged === false ? '，本轮内容未变化' : ''}${success && !posts.length ? '，暂无近期可读推文' : success && !posts.some(p => p.airdropSignal) ? '，未发现新的空投候选线索' : ''}。`);
    if (success && onDone.current) void onDone.current().catch(() => { if (mounted.current) setMessage(`${prefix}；公共项目列表暂时加载失败，可稍后重试。`); });
  }, [result, settings?.testError]);
  const action = async (kind: NonNullable<typeof busy>, run: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(kind); setFailed(false); setMessage(''); generation.current++;
    try { await run(); }
    catch (e) { if (mounted.current) displayError(e); throw e; }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  };
  return {
    available, settings, result, loading, busy, message, failed, reload,
    clearMessage: () => { setMessage(''); setFailed(false); },
    save: (token: string) => action('save', async () => { const next = await saveXSettings(token); const data = await getXResult(); if (mounted.current) { setSettings(next); setResult(data); setMessage(next.testError?.message ?? '配置检测通过并已保存，正在抓取你的 X 情报…'); setFailed(!!next.testError); } }),
    test: () => action('test', async () => { const next = await testXSettings(); if (mounted.current) { setSettings(next); setMessage('账号查询与推文读取均通过检测。'); } }),
    remove: () => action('remove', async () => { await deleteXSettings(); if (mounted.current) { setSettings({ configured: false, testedAt: null, testError: null, task: null }); setResult(emptyResult()); setMessage('已删除你的 X 配置和个人动态。'); } }),
    refresh: () => action('refresh', async () => { const task = await refreshX(); if (mounted.current) { setResult(r => ({ ...r, task })); setMessage('抓取任务已启动，请等待结果。'); } }),
  };
}
export type XSettingsController = ReturnType<typeof useXSettings>;
