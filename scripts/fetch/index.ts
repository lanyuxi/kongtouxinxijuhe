import type { SourceAdapter } from './types';
import { airdropsIoAdapter } from './airdrops-io';
import { defiLlamaAdapter } from './defillama';
import { twitterAdapter } from './twitter';

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
/**
 * X（Twitter）适配器的接入前提。
 *
 * 实测结论（2026-09-16，本仓库 Runner 环境，见 scripts/fetch/twitter.ts 头部注释）：
 *   在「零服务端 + 不带任何凭据」的约束下，X 的推文**抓不到** ——
 *   x.com / api.x.com / cdn.syndication.twimg.com 均在 TLS 层被重置，
 *   nitter 与 rsshub 的公开实例已全部失效。
 *
 * 因此这里的分支是「能力开关」，不是「临时开关」：
 *   · 未配置 X_BEARER_TOKEN：仍接入适配器，但它只做**确定性**的那部分工作
 *     —— 建立官方 X 账号索引 + 用 X 官方 embed 端点验证账号真实存在。
 *     这是真实性交叉验证的真实增益，且零凭据可用。
 *   · 配置了 X_BEARER_TOKEN：额外拉取近期推文，命中空投关键词的推文
 *     升级为项目线索（这才是用户真正想要的「从 X 获取空投消息」）。
 *
 * 为什么不直接不接入：
 *   用户明确要求接入 X。直接说「做不到」等于什么都没做；
 *   而把凭据门槛摆到明面上（未配置时前端显示「未配置凭据」而非「抓取失败」），
 *   用户随时可以只加一个环境变量把能力打开，无需改代码。
 */
export const adapters: SourceAdapter[] = [
  airdropsIoAdapter,
  defiLlamaAdapter,
  twitterAdapter,
];

export type { SourceAdapter };
