import type { SourceAdapter } from './types';
import { airdropsIoAdapter } from './airdrops-io';
import { defiLlamaAdapter } from './defillama';

/**
 * 实际启用的数据源。
 *
 * ⚠️ galxeAdapter 已于 2026-09 下线（实现仍保留在 galxe.ts，接口未变，日后可一行接回）：
 *   它的页面是纯客户端渲染，官方 GraphQL 又需要登录态 / API Key，
 *   在「零服务器、不带任何凭据」的约束下**不可能**抓到任务数据 ——
 *   它长期处于 ok: false，每轮都在页面上显示一次「数据源异常」。
 *   对一个面向新手的站点来说，一条永远失败的来源是纯负资产：
 *   用户会以为系统坏了，进而怀疑其他数据。
 *   与其长期挂着一个「如实报错的占位」，不如明确移除。
 */
export const adapters: SourceAdapter[] = [
  airdropsIoAdapter,
  defiLlamaAdapter,
];

export type { SourceAdapter };
