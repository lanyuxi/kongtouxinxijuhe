/**
 * Logo 候选来源（按优先级）。
 *
 * 设计约束：
 *  - 站点是纯静态的，图标必须随仓库一起发布，因此这里只负责「下载原始文件」，
 *    由 fetch-logos.mjs 落盘到 public/logos/ 并写入 data/logo-map.json。
 *  - 官方 logo 的来源优先级：DefiLlama 图标库 → 各项目官网 favicon → 人工映射。
 */

/** 从 URL 中取出主机名，取不出来返回 null（避免把无效链接当域名用） */
export function hostOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** 明确的第三方聚合站 / 任务平台 / 交易所跳转页，不能当作项目官网取 favicon */
const NON_OFFICIAL_HOSTS = [
  'defillama.com',
  'airdrops.io',
  'app.galxe.com',
  'galxe.com',
  'coinmarketcap.com',
  'coingecko.com',
  'dexscreener.com',
  'x.com',
  'twitter.com',
  'medium.com',
  'mirror.xyz',
  'linktr.ee',
  'drive.google.com',
  'docs.google.com',
  'notion.site',
  'github.com',
  'gitbook.io',
  'substack.com',
  'discord.gg',
  't.me',
  'trk' /* 营销短链：click.trkreels.com 之类 */,
];

/** 是否可信的「官方站点」域名 */
export function isOfficialHost(host) {
  if (!host) return false;
  if (!host.includes('.')) return false;
  if (/^(www\.)?[a-z0-9-]+\.(io|xyz|fi|so|ag|com|org|net|finance|exchange|fun|world|ai|one|tech|network|co|app|dev|dao|money|cash|farm|protocol|labs)?$/.test(host) === false) {
    /* 兜底规则留给下面的排除表，这里不做后缀白名单限制 */
  }
  return !NON_OFFICIAL_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`) || host.includes(bad));
}

/**
 * favicon 抓取服务（按顺序尝试）。
 * 说明：
 *   - faviconextractor：域名不存在时返回 404，能明确判断「拿不到」；
 *   - favicon.im：覆盖面更广，但失败时返回灰色占位图，需要靠体积 + 像素检测兜底。
 */
export function faviconUrls(host) {
  return [
    `https://www.faviconextractor.com/favicon/${host}?larger=true`,
    `https://favicon.im/${host}`,
    `https://icon.horse/icon/${host}`,
  ];
}

/** DefiLlama 协议图标（官方 logo 的镜像，按 slug 取） */
export function llamaIconUrl(slug) {
  return `https://icons.llamao.fi/icons/protocols/${slug}`;
}

/**
 * 按文件头嗅探真实图片格式。
 * 为什么不信任 content-type：favicon 服务经常把 ico 标成 image/png，
 * 或者在域名不存在时返回一段 HTML，只看响应头会把错误页当图片存下来。
 */
export function sniffImage(buf) {
  if (!buf || buf.length < 16) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('00000100')) return 'ico';
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  const head = buf.subarray(0, 64).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

/**
 * SVG 里若是「一个字母 + 圆底」这种生成式占位图，则视为无效。
 * 典型例子：favicon.im 在拿不到 favicon 时返回的灰色圆形 + 斜体 f。
 */
export function isPlaceholderSvg(text) {
  const t = String(text).replace(/\s+/g, ' ');
  if (!/<svg/i.test(t)) return false;
  if (/fill="#808080"/i.test(t) && /font-style="italic"/i.test(t)) return true;
  const textNodes = [...t.matchAll(/>([^<>]{1,3})</g)].map((m) => m[1].trim()).filter(Boolean);
  if (textNodes.length === 1 && textNodes[0].length === 1) return true;
  return false;
}
