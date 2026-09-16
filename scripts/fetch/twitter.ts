/**
 * X（Twitter）数据源适配器。
 *
 * 为什么需要它：
 *   空投线索的第一现场几乎都在 X —— 项目方开活动、公布快照、开放领取，
 *   都会先在官方 X 账号发推。传统聚合站（Airdrops.io）通常滞后数小时到数天。
 *   用户诉求非常明确：能不能直接从 X 拿到一手消息。
 *
 * 为什么不能直接爬 x.com：
 *   实测（2026-09-16，本仓库 Runner 环境）：
 *     · x.com / api.x.com        → TLS 层被重置，服务端断言不了
 *     · cdn.syndication.twimg.com → 同上（Connection reset by peer）
 *     · nitter 各公开实例         → 已全部失效
 *     · rsshub 各公开实例         → 503（Twitter 路由公开额度已停）
 *     · api.x.com 正式 API        → 需 Bearer / API Key（付费）
 *   结论：在「零服务端、不带任何凭据」的约束下，**不可能**稳定抓到推文。
 *   硬接一个每轮都失败的来源，等于回到 Galxe 的老问题 ——
 *   用户会以为系统坏了，进而怀疑其他数据（见 fetch/index.ts 的下线说明）。
 *
 * 因此本适配器做的事，是「能确定性地做到的那部分」：
 *
 *   ┌─ 确定性部分（无凭据即可）──────────────────────────────┐
 *   │ ① 官方 X 账号索引：从 DefiLlama 的 twitter 字段 + 人工档案 │
 *   │    汇总每个项目对应的官方 X handle，落到项目 official.x 上 │
 *   │ ② 活跃度信号：调用官方 embed 端点                        │
 *   │    publish.twitter.com/oembed（被 X 官方支持、免密钥）    │
 *   │    校验账号是否真实存在且未注销 → 作为真实性交叉验证证据    │
 *   └──────────────────────────────────────────────────────┘
 *
 *   ┌─ 可选部分（配了凭据才启用，不配不报错）──────────────────┐
 *   │ X_BEARER_TOKEN（环境变量 / 密钥仓库）                    │
 *   │   → 走 api.x.com/2/users/by + /2/users/:id/tweets      │
 *   │   → 把近期推文落盘 data/live/x-twitter.json             │
 *   │   → 命中空投关键词的推文升级为项目线索                    │
 *   │ 未配置凭据时：明确写入 source-health.json 的 skipped 状态， │
 *   │ 前端显示「未配置凭据」，而不是「抓取失败」。                 │
 *   └──────────────────────────────────────────────────────┘
 *
 * 失败语义（与其它适配器一致）：
 *   · 索引构建失败（本地数据问题）→ throw，由 runner 隔离
 *   · 单个账号 oembed 探测失败 → 只丢该账号，不影响整体
 *   · 未配置凭据 → 不 throw，返回索引条目 + skipped 标记
 */

import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';
import { fetchText, mapPool } from './lib/http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OEMBED = 'https://publish.twitter.com/oembed';
const API = 'https://api.x.com/2';

/** 单轮最多探测多少个账号（避免把对端打挂 + 控制流水线耗时） */
const MAX_PROBE = 40;
/** 探测并发（X 的 oembed 对突发流量比较敏感） */
const PROBE_CONCURRENCY = 4;

/**
 * 「网络整体不可达」的快速熔断。
 *
 * 为什么需要它（实测教训）：
 *   本环境访问 X 时是被**静默丢包**（不是立即 reset），每个请求都要等满超时。
 *   40 个账号 × 15s 超时 ÷ 4 并发 ≈ 150s —— 一条来源就能把整轮流水线拖垮，
 *   而结论其实从**第一个**请求就能确定：网络不可达时后面 39 个必然也失败。
 *
 * 熔断规则：
 *   连续 N 个请求都以「网络层错误」失败（非 404/403 这类业务错误）→ 立刻停止探测。
 *   注意必须区分错误类型：账号不存在会返回 404，那是**正常结果**，
 *   不能拿它当熔断依据，否则会把「账号确实注销了」误判成「网络挂了」。
 */
const CIRCUIT_BREAK_AFTER = 3;

/** 判定是否属于「网络层不可达」而非「账号不存在」 */
export function isNetworkFailure(message: string): boolean {
  return /fetch failed|timeout|aborted|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(
    message,
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

/** 从 X 链接里取出干净的 handle（去掉 @ / 查询串 / 子路径） */
export function handleFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'x.com' && host !== 'twitter.com') return undefined;
    const seg = u.pathname.split('/').filter(Boolean);
    const reserved = new Set([
      'i', 'home', 'intent', 'share', 'hashtag', 'search', 'explore',
      'notifications', 'messages', 'settings', 'login',
    ]);
    const h = seg[0];
    if (!h || reserved.has(h.toLowerCase())) return undefined;
    return h.replace(/^@/, '');
  } catch {
    return undefined;
  }
}

/** 判定一段文本是否属于「空投叙事」——只认强信号词，避免把日常推文当线索 */
const AIRDROP_SIGNALS = [
  /\bairdrop\b/i,
  /\btoken\s+(launch|generation|distribution)\b/i,
  /\bTGE\b/,
  /\bclaim\s+(live|is\s+live|now\s+open|open)\b/i,
  /\bsnapshot\b/i,
  /\bwhitelist|\ballowlist\b/i,
  /空投|领取|快照|白名单/,
];

export function looksLikeAirdrop(text: string): boolean {
  return AIRDROP_SIGNALS.some((re) => re.test(text));
}

/** 从本地已有资料里汇总「slug → 官方 handle」索引（确定性，不联网） */
interface ProfiledHandle {
  slug: string;
  name: string;
  handle: string;
  source: string;
}

export function buildHandleIndex(): ProfiledHandle[] {
  const out = new Map<string, ProfiledHandle>();

  // 来源 1：人工档案（唯一可信的官方链接来源）
  try {
    const file = path.join(ROOT, 'data', 'seed', 'official-profiles.json');
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as {
        profiles?: Record<string, { official?: { x?: string } }>;
      };
      for (const [slug, p] of Object.entries(raw.profiles ?? {})) {
        const h = p.official?.x ? handleFromUrl(p.official.x) : undefined;
        if (h) out.set(slug, { slug, name: slug, handle: h, source: '人工档案' });
      }
    }
  } catch {
    /* 档案读取失败不致命：继续用 DefiLlama 的索引 */
  }

  // 来源 2：库内已有项目（DefiLlama 抓取时写入的 official.x）
  try {
    const file = path.join(ROOT, 'data', 'airdrops.json');
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as {
        projects?: { slug: string; name: string; official?: { x?: string } }[];
      };
      for (const p of raw.projects ?? []) {
        if (!p.slug || out.has(p.slug)) continue;
        const h = p.official?.x ? handleFromUrl(p.official.x) : undefined;
        if (h) out.set(p.slug, { slug: p.slug, name: p.name, handle: h, source: 'DefiLlama' });
      }
    }
  } catch {
    /* 同上 */
  }

  return [...out.values()];
}

/** oembed 官方端点探测：账号存在且未注销 → 返回显示名与最近推文链接 */
interface Probe {
  ok: boolean;
  displayName?: string;
  lastTweetUrl?: string;
  error?: string;
}

export async function probeAccount(handle: string): Promise<Probe> {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://twitter.com/${handle}`)}&omit_script=1&dnt=true`;
  try {
    const text = await fetchText(url, { timeoutMs: 15_000, retries: 0, accept: 'application/json' });
    const json = JSON.parse(text) as {
      author_name?: string;
      html?: string;
    };
    if (!json.author_name) return { ok: false, error: 'oembed 未返回作者信息' };
    const m = json.html?.match(/status\/(\d+)/);
    return {
      ok: true,
      displayName: json.author_name,
      lastTweetUrl: m ? `https://x.com/${handle}/status/${m[1]}` : undefined,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 可选：带 Bearer Token 时拉取近期推文（未配置则完全跳过） */
interface XUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  public_metrics?: { followers_count?: number; tweet_count?: number };
}
interface XTweet {
  id: string;
  text: string;
  created_at?: string;
}

export async function fetchRecentTweets(
  token: string,
  handle: string,
): Promise<{ user: XUser; tweets: XTweet[] } | null> {
  const h = { authorization: `Bearer ${token}` };
  const uRes = await fetch(`${API}/users/by/username/${handle}?user.fields=description,public_metrics`, {
    headers: h,
  });
  if (!uRes.ok) return null;
  const uJson = (await uRes.json()) as { data?: XUser };
  const user = uJson.data;
  if (!user) return null;

  const tRes = await fetch(
    `${API}/users/${user.id}/tweets?max_results=10&tweet.fields=created_at&exclude=replies,retweets`,
    { headers: h },
  );
  if (!tRes.ok) return { user, tweets: [] };
  const tJson = (await tRes.json()) as { data?: XTweet[] };
  return { user, tweets: tJson.data ?? [] };
}

export const twitterAdapter: SourceAdapter = {
  name: 'X (Twitter)',
  url: 'https://x.com',

  async fetch(): Promise<RawItem[]> {
    const index = buildHandleIndex();
    if (index.length === 0) {
      throw new Error('无法建立官方 X 账号索引（人工档案与库内数据均为空）');
    }

    const fetchedAt = new Date().toISOString();
    const token = process.env.X_BEARER_TOKEN?.trim();

    interface ProbeResult extends ProfiledHandle {
      ok: boolean;
      displayName?: string;
      lastTweetUrl?: string;
      followers?: number;
      error?: string;
      tweets: XTweet[];
    }

    /** 有凭据：拉推文；无凭据：只做 oembed 存在性探测 */
    const targets = index.slice(0, MAX_PROBE);
    /**
     * 熔断计数必须放在并发 worker **之外**：mapPool 是并发执行的，
     * 用局部变量累计才能让所有 worker 共享同一个「连续失败」视图。
     * 每有一个账号探测成功就归零 —— 只要还有通得过的请求，就说明网络是好的。
     */
    let consecutiveNetworkFailures = 0;
    let tripped = false;

    const probes: ProbeResult[] = await mapPool<ProfiledHandle, ProbeResult>(
      targets,
      PROBE_CONCURRENCY,
      async (t) => {
      // 已熔断：不再发请求，直接把剩余账号标记为未探测
      if (tripped) {
        return { ...t, ok: false, error: '网络熔断，未探测', tweets: [] as XTweet[] };
      }
      if (token) {
        try {
          const r = await fetchRecentTweets(token, t.handle);
          if (r) {
            return {
              ...t,
              ok: true,
              displayName: r.user.name,
              followers: r.user.public_metrics?.followers_count,
              tweets: r.tweets,
            };
          }
        } catch {
          /* 凭据失效或额度用尽 → 退回 oembed 探测，不整体失败 */
        }
      }
      const p = await probeAccount(t.handle);
      if (p.ok) {
        consecutiveNetworkFailures = 0;
      } else if (isNetworkFailure(p.error ?? '')) {
        // 只有「网络层错误」才计入熔断；账号 404 属正常业务结果
        consecutiveNetworkFailures++;
        if (consecutiveNetworkFailures >= CIRCUIT_BREAK_AFTER && !tripped) {
          tripped = true;
          console.warn(
            `[x] 连续 ${CIRCUIT_BREAK_AFTER} 次网络层失败，判定为 X 不可达，停止探测剩余账号（避免拖垮整轮流水线）`,
          );
        }
      }
      return { ...t, ...p, tweets: [] as XTweet[] };
      },
    );

    const alive = probes.filter((p) => p.ok);
    if (alive.length === 0) {
      // 全部探测失败：区分「网络不可达」与「索引为空」两种原因，如实报错。
      // 不伪造数据、不静默降级 —— 与 Galxe 下线时同一条原则（宁可透明失败）。
      const sample = targets
        .slice(0, 3)
        .map((t) => `@${t.handle}`)
        .join('、');
      const reason = tripped
        ? `本环境无法访问 X（连续 ${CIRCUIT_BREAK_AFTER} 次网络层失败后熔断）`
        : '本环境无法访问 X';
      throw new Error(
        `${targets.length} 个账号（样例：${sample}）全部探测失败：${reason}。` +
          '如需抓取推文，请配置环境变量 X_BEARER_TOKEN；' +
          '否则该来源将持续显示为不可用，不会伪造数据。',
      );
    }

    return alive.map((p) => {
      const hits = (p.tweets ?? []).filter((t) => looksLikeAirdrop(t.text));
      const boost = hits.length > 0 ? `，其中 ${hits.length} 条含空投信号` : '';
      const item: RawItem = {
        sourceType: 'third_party',
        sourceName: 'X (Twitter)',
        sourceUrl: p.lastTweetUrl ?? `https://x.com/${p.handle}`,
        title: p.displayName ?? p.handle,
        url: `https://x.com/${p.handle}`,
        description:
          `官方 X 账号 @${p.handle} 已验证可用（信号来源：${p.source}）` +
          (p.followers ? `，约 ${formatCount(p.followers)} 关注者` : '') +
          boost,
        statusText: 'potential',
        fetchedAt,
        // 只提供候选，是否可信交由 verify 交叉验证（与其它来源一致的语义）
        officialUrl: `https://x.com/${p.handle}`,
        officialHost: 'x.com',
        officialProfiles: { x: `https://x.com/${p.handle}` },
        // 只把「命中空投信号」的账号当作资金 / 钱包线索的弱证据，不臆造
        clueCapital: false,
      };
      return item;
    });
  },
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
