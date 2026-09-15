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

/**
 * 取「根域」：a.b.example.com → example.com；同时剥掉 www。
 *
 * 为什么需要它：
 *   数据源抓到的官网常常是子域（app. / claim. / engage. / portal. …），
 *   而 favicon 绝大多数挂在根域上。原实现只拿抓到的那个主机名去请求 favicon，
 *   子域一旦没有独立图标就整条候选链失败 —— beezie 走的正是这条路径。
 *   补一个根域候选，成本是一次额外请求，换来的是整个子域场景的覆盖率。
 *
 * 注意：不处理 `.co.uk` 这类多段公共后缀（本项目涉及的项目几乎没有），
 *      保守返回「最后两段」，比引入完整 PSL 依赖更可控。
 */
export function rootDomainOf(host) {
  if (!host) return null;
  const h = host.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

/**
 * 从图片文件头解析真实像素尺寸（纯 JS，不依赖任何外部二进制）。
 *
 * 为什么必须自带解析器，而不是调 ffprobe：
 *   CI 跑在 `node:22` 官方镜像里，**不含 ffmpeg/ffprobe**。
 *   原实现用 ffprobe 探测尺寸，探测失败即被判为「无法解析图像尺寸」，
 *   于是所有非 SVG 候选全部落空 —— 而本地（装了 ffmpeg）却一切正常。
 *   这是一类最难查的「环境差异型失败」：同一条命令本地过、CI 挂。
 *   尺寸本就写在文件头里，自己解析既准确又零依赖。
 *
 * 覆盖 PNG / JPEG / GIF / WebP(VP8/VP8L/VP8X) / BMP / ICO。
 * 解析不出来返回 null（按「无法解析」处理，不会误判为可用）。
 */
export function parseImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  const hex = buf.subarray(0, 12).toString('hex');

  // PNG：签名 8 字节 + 长度 4 + 类型 4，随后即 IHDR 的宽高（大端）
  if (hex.startsWith('89504e470d0a1a0a')) {
    if (buf.length < 24) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  // JPEG：逐段跳过，找 SOFn（0xC0-0xCF，排除 DHT/JPG/DAC）
  if (hex.startsWith('ffd8ff')) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off += 1;
        continue;
      }
      const marker = buf[off + 1];
      // 无长度字段的标记：直接跳过
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
    return null;
  }

  // GIF：逻辑屏幕描述符固定在第 6 字节，小端
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }

  // WebP：三种子格式的宽高位置各不相同
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const fourcc = buf.subarray(12, 16).toString('ascii');
    if (fourcc === 'VP8 ') {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      return {
        w: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        h: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
      };
    }
    return null;
  }

  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { w: Math.abs(buf.readInt32LE(18)), h: Math.abs(buf.readInt32LE(22)) };
  }

  // ICO / CUR：取目录里分辨率最大的一条（0 表示 256）
  if (hex.startsWith('00000100') || hex.startsWith('00000200')) {
    const count = buf.readUInt16LE(4);
    if (count < 1 || buf.length < 6 + count * 16) return null;
    let best = null;
    for (let i = 0; i < count; i++) {
      const off = 6 + i * 16;
      const w = buf[off] === 0 ? 256 : buf[off];
      const h = buf[off + 1] === 0 ? 256 : buf[off + 1];
      if (!best || w * h > best.w * best.h) best = { w, h };
    }
    return best;
  }

  return null;
}
